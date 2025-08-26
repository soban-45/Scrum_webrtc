from django.db import models

class Employee(models.Model):
    employee_name = models.CharField(max_length=100)
    employee_id = models.CharField(max_length=50, unique=True)
    role = models.CharField(max_length=100) 
    email = models.EmailField(unique=True, null=True, blank=True)


    def __str__(self):
        return f"{self.employee_name} ({self.employee_id}) - {self.role}"


class Project(models.Model):
    project_id = models.CharField(max_length=50, unique=True, null=True, blank=True)  
    project_name = models.CharField(max_length=100)
    employees = models.ManyToManyField(Employee)
    excel_file = models.FileField(upload_to='project_excels/', null=True, blank=True)


    def __str__(self):
        return f"{self.project_name} ({self.project_id})"


class StandupEntry(models.Model):
    date = models.DateTimeField(auto_now_add=True)
    project = models.ForeignKey('Project', on_delete=models.SET_NULL, null=True, blank=True)
    employee = models.ForeignKey('Employee', on_delete=models.SET_NULL, null=True, blank=True)

    completed_yesterday = models.TextField(blank=True)
    plan_today = models.TextField(blank=True)
    blockers = models.TextField(blank=True)
    summary = models.TextField(blank=True)

    def __str__(self):
        return f"{self.date.date()} - {self.employee.employee_name if self.employee else 'Unknown'}"
