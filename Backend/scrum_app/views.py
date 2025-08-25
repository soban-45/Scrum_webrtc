from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from rest_framework import status
from django.http import JsonResponse, HttpResponse
from .utils import summarize_standup_conversation, save_standup_data
import openai, tempfile, os, base64
from dotenv import load_dotenv
from datetime import datetime, timedelta
from .serializers import ProjectSerializer, ProjectNameOnlySerializer
from .models import Project, Employee, StandupEntry
import pandas as pd
from django.utils.timezone import localtime
from django.core.files import File
from django.utils.timezone import now
from io import BytesIO
from openpyxl import load_workbook
import os
import json
import requests
import logging
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.conf import settings


class EndConversationView(APIView):
    def post(self, request):
        try:
            conversation = request.data.get('conversation', [])
            print(conversation,"<--- conversation data")
            project_id = request.data.get('project_id')

            if not project_id:
                return Response({"error": "project_id is required"}, status=400)

            # Fetch the project
            try:
                project = Project.objects.prefetch_related('employees').get(project_id=project_id)
            except Project.DoesNotExist:
                return Response({"error": "Project not found"}, status=404)

            # Call GPT to summarize
            standup_data = summarize_standup_conversation(conversation)

            # Enrich each entry with project/employee info
            for entry in standup_data:
                entry["project_name"] = project.project_name

                emp = next(
                    (e for e in project.employees.all()
                     if e.employee_name.lower() == entry["name"].lower()),
                    None)
                entry["employee_id"] = emp.employee_id if emp else "Not specified"

            # ✅ Determine Excel file path
            excel_dir = os.path.join(settings.MEDIA_ROOT, "project_excels")
            os.makedirs(excel_dir, exist_ok=True)
            excel_filename = f"standup_{project.project_id}.xlsx"
            excel_path = os.path.join(excel_dir, excel_filename)

            if not project.excel_file or not os.path.exists(project.excel_file.path):
                excel_buffer = BytesIO()
                save_standup_data(standup_data, excel_buffer)  # Modified to accept file-like objects
                excel_buffer.seek(0)

                # Save to FileField
                project.excel_file.save(excel_filename, File(excel_buffer))
                project.save()
                excel_path = project.excel_file.path
            else:
                # Use existing file path for appending
                excel_path = project.excel_file.path
                save_standup_data(standup_data, excel_path)

            # ✅ Save entries to DB
            for entry in standup_data:
                employee = next(
                    (e for e in project.employees.all()
                     if e.employee_name.lower() == entry["name"].lower()),
                    None)

                StandupEntry.objects.create(
                    project=project,
                    employee=employee,
                    completed_yesterday=entry.get("completed_yesterday", "Not specified"),
                    plan_today=entry.get("plan_today", "Not specified"),
                    blockers=entry.get("blockers", "None"),
                    summary=entry.get("summary", "")
                )

            return Response({
                "message": "Standup meeting saved successfully",
                "data": standup_data
            })

        except Exception as e:
            return Response({"error": str(e)}, status=500)


class ProjectAPIView(APIView):

    def get(self, request):
        project_id = request.query_params.get('project_id')
        email = request.query_params.get('email')

        if project_id:
            try:
                project = Project.objects.prefetch_related('employees').get(
                    project_id=project_id)
                serializer = ProjectSerializer(project)
                return Response(serializer.data)
            except Project.DoesNotExist:
                return Response({"error": "Project not found."},
                                status=status.HTTP_404_NOT_FOUND)
        else:
            # Filter projects by employee email if provided
            if email:
                try:
                    employee = Employee.objects.get(email=email)
                    projects = Project.objects.filter(employees=employee)
                    if not projects.exists():
                        return Response({"error": "No projects found for this email."},
                                        status=status.HTTP_404_NOT_FOUND)
                except Employee.DoesNotExist:
                    return Response({"error": "Employee with this email not found."},
                                    status=status.HTTP_404_NOT_FOUND)
            else:
                # Return all projects if no email filter
                projects = Project.objects.all()
            
            serializer = ProjectNameOnlySerializer(projects, many=True)
            return Response(serializer.data)


class EmployeeLastStandupView(APIView):

    def get(self, request):
        employee_id = request.query_params.get("employee_id")
        if not employee_id:
            return JsonResponse({"error": "employee_id is required"}, status=400)

        try:
            # Find the matching employee
            try:
                employee = Employee.objects.get(employee_id=employee_id)
            except Employee.DoesNotExist:
                return JsonResponse({"error": f"Employee ID {employee_id} not found"}, status=404)

            # Compute "yesterday" (same timezone)
            today = localtime(now()).date()
            yesterday = today - timedelta(days=1)

            # Find standup entries from that day
            standup_entry = (
                StandupEntry.objects
                .filter(employee=employee)
                .filter(date__date=yesterday)
                .order_by("-date")
                .select_related("project")
                .first()
            )

            if not standup_entry:
                return JsonResponse({
                    "message": f"No standup entry found for employee {employee_id} on {yesterday}"
                }, status=404)

            # Build response matching the Excel structure
            response_data = {
                "Date": localtime(standup_entry.date).strftime("%Y-%m-%d %H:%M:%S") if standup_entry.date else None,
                "Project Name": standup_entry.project.project_name if standup_entry.project else "Not specified",
                "Name": employee.employee_name or "Not specified",
                "Employee ID": employee.employee_id or "Not specified",
                "Completed Yesterday": standup_entry.completed_yesterday or "Not specified",
                "Plan Today": standup_entry.plan_today or "Not specified",
                "Blockers": standup_entry.blockers or "None",
                "Summary": standup_entry.summary or ""
            }

            return JsonResponse({"data": response_data})

        except Exception as e:
            return JsonResponse({"error": f"Failed to retrieve data: {str(e)}"}, status=500)
        


logger = logging.getLogger(__name__)

OPENAI_REALTIME_URL = "https://api.openai.com/v1/realtime"


@csrf_exempt
@require_http_methods(["POST"])
def webrtc_signal(request):
    """WebRTC signaling endpoint that proxies to OpenAI Realtime API"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    api_key = getattr(settings, 'OPENAI_API_KEY',
                      os.environ.get('OPENAI_API_KEY'))
    if not api_key:
        logger.error("OpenAI API key not configured")
        return JsonResponse({'error': 'OpenAI API key not configured'},
                            status=500)

    try:
        request_data = json.loads(request.body.decode('utf-8'))
        sdp_offer = request_data.get('sdp')
        session_params = request_data.get('session_params', {})

        if not sdp_offer:
            logger.error("SDP offer not provided in request body")
            return JsonResponse(
                {'error': 'SDP offer not provided in request body'},
                status=400)

        model = session_params.get('model',
                                   'gpt-4o-realtime-preview-2024-12-17')
        api_url = f"{OPENAI_REALTIME_URL}?model={model}"

        logger.info(f"Making request to OpenAI API: {api_url}")

        response = requests.post(api_url,
                                 headers={
                                     'Authorization': f'Bearer {api_key}',
                                     'Content-Type': 'application/sdp',
                                     'OpenAI-Beta': 'realtime=v1'
                                 },
                                 data=sdp_offer,
                                 timeout=30)

        response.raise_for_status()
        sdp_answer = response.text

        return JsonResponse({
            'sdp': sdp_answer,
            'session_data': session_params
        })

    except requests.exceptions.HTTPError as http_err:
        error_content = "Unknown error"
        try:
            error_content = http_err.response.json(
            ) if http_err.response else str(http_err)
        except json.JSONDecodeError:
            error_content = http_err.response.text if http_err.response else str(
                http_err)
        logger.error(f"OpenAI API HTTP error: {http_err} - {error_content}")
        return JsonResponse(
            {
                'error': 'OpenAI API error',
                'details': error_content
            },
            status=(http_err.response.status_code
                    if http_err.response else 500))
    except Exception as e:
        logger.error(f"Server error in webrtc_signal: {str(e)}", exc_info=True)
        return JsonResponse({
            'error': 'Server error',
            'details': str(e)
        },
                            status=500)



EXCEL_FILE = "standup_meetings.xlsx"


class DownloadExcelView(APIView):
    def get(self, request):
        project_id = request.query_params.get('project_id')

        if not project_id:
            return Response({"error": "project_id query parameter is required"}, status=400)

        try:
            project = Project.objects.get(project_id=project_id)

            if not project.excel_file or not os.path.exists(project.excel_file.path):
                return Response({"error": "Excel file not found for this project"}, status=404)

            with open(project.excel_file.path, 'rb') as excel_file:
                response = HttpResponse(
                    excel_file.read(),
                    content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
                filename = os.path.basename(project.excel_file.name)
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
                response['Content-Length'] = os.path.getsize(project.excel_file.path)
                return response

        except Project.DoesNotExist:
            return Response({"error": "Project not found"}, status=404)
        except Exception as e:
            return Response({"error": f"Failed to download Excel file: {str(e)}"}, status=500)
        



from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
import subprocess
import sys

@csrf_exempt
def start_bot(request):
    if request.method == "POST":
        try:
            body = json.loads(request.body.decode("utf-8"))
            meet_url = body.get("meet_url")

            if not meet_url:
                return JsonResponse({"error": "Missing meetUrl"}, status=400)

            # 🔹 Trigger bot runner in background
            subprocess.Popen([sys.executable, "bot_runner.py", meet_url])

            return JsonResponse({
                "status": "ok",
                "bot_started": True,
                "meet_url": meet_url
            })
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    else:
        return JsonResponse({"error": "Invalid method"}, status=405)



