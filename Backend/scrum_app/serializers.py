from rest_framework import serializers
from .models import Project, Employee

class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ['id', 'employee_name', 'employee_id', 'role']

class ProjectSerializer(serializers.ModelSerializer):
    employees = EmployeeSerializer(many=True)

    class Meta:
        model = Project
        fields = ['id', 'project_name', 'employees']

class ProjectNameOnlySerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ['id', 'project_name']
