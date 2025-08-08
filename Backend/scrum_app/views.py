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
from .models import Project, Employee
import pandas as pd


class EndConversationView(APIView):

    def post(self, request):
        try:
            conversation = request.data.get('conversation', [])
            project_id = request.data.get('project_id')

            # Fetch project details
            project = None
            if project_id:
                try:
                    project = Project.objects.prefetch_related(
                        'employees').get(id=project_id)
                except Project.DoesNotExist:
                    return Response({"error": "Project not found"}, status=404)

            # Get structured data from conversation
            standup_data = summarize_standup_conversation(conversation)

            # Add project & employee IDs into each standup entry
            for entry in standup_data:
                entry[
                    "project_name"] = project.project_name if project else "Not specified"

                # match employee_id from project.employees based on name
                emp = next(
                    (e for e in project.employees.all()
                     if e.employee_name.lower() == entry["name"].lower()),
                    None)
                entry[
                    "employee_id"] = emp.employee_id if emp else "Not specified"

            # Save to Excel
            save_standup_data(standup_data)

            return Response({
                "message": "Standup meeting saved successfully",
                "data": standup_data
            })

        except Exception as e:
            return Response({"error": str(e)}, status=500)


class ProjectAPIView(APIView):

    def get(self, request):
        project_id = request.query_params.get('project_id')

        if project_id:
            try:
                project = Project.objects.prefetch_related('employees').get(
                    id=project_id)
                serializer = ProjectSerializer(project)
                return Response(serializer.data)
            except Project.DoesNotExist:
                return Response({"error": "Project not found."},
                                status=status.HTTP_404_NOT_FOUND)
        else:
            # Return only project names
            projects = Project.objects.all()
            serializer = ProjectNameOnlySerializer(projects, many=True)
            return Response(serializer.data)


EXCEL_FILE = "standup_meetings.xlsx"


class EmployeeLastStandupView(APIView):

    def get(self, request):
        employee_id = request.query_params.get("employee_id")
        if not employee_id:
            return JsonResponse({"error": "employee_id is required"},
                                status=400)

        try:
            # Read the Excel file
            df = pd.read_excel(EXCEL_FILE)

            if df.empty:
                return JsonResponse({"error": "No data found in Excel"},
                                    status=404)

            # Convert Date column to datetime
            df["Date"] = pd.to_datetime(df["Date"], errors="coerce")

            # ✅ First, check if employee exists in Excel at all
            df_all_emp = df[df["Employee ID"].astype(str) == str(employee_id)]
            if df_all_emp.empty:
                return JsonResponse(
                    {
                        "message":
                        f"No records found for employee ID {employee_id}"
                    },
                    status=404)

            # ✅ Get the most recent standup entry for this employee
            df_sorted = df_all_emp.sort_values("Date", ascending=False)

            if df_sorted.empty:
                return JsonResponse(
                    {
                        "message":
                        f"No standup entry found for employee {employee_id}"
                    },
                    status=404)

            # Get most recent record & replace NaN/NaT with None
            last_record = df_sorted.iloc[0].where(
                pd.notnull(df_sorted.iloc[0]), None).to_dict()

            # Convert datetime to string for JSON serialization
            if last_record.get("Date"):
                last_record["Date"] = last_record["Date"].strftime(
                    "%Y-%m-%d %H:%M:%S")

            return JsonResponse({"data": last_record})

        except FileNotFoundError:
            return JsonResponse({"error": "Excel file not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": f"Failed to read Excel: {str(e)}"},
                                status=500)


import os
import json
import requests
import logging
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.conf import settings

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


class DownloadExcelView(APIView):

    def get(self, request):
        try:
            excel_file_path = EXCEL_FILE

            if not os.path.exists(excel_file_path):
                return Response({"error": "Excel file not found"}, status=404)

            with open(excel_file_path, 'rb') as excel_file:
                response = HttpResponse(
                    excel_file.read(),
                    content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
                response['Content-Disposition'] = f'attachment; filename="standup_meetings.xlsx"'
                response['Content-Length'] = os.path.getsize(excel_file_path)
                return response

        except Exception as e:
            return Response({"error": f"Failed to download Excel file: {str(e)}"}, status=500)