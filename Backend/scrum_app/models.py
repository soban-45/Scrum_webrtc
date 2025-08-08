from django.db import models

class Employee(models.Model):
    employee_name = models.CharField(max_length=100)
    employee_id = models.CharField(max_length=50, unique=True)
    role = models.CharField(max_length=100) 

    def __str__(self):
        return f"{self.employee_name} ({self.employee_id}) - {self.role}"


class Project(models.Model):
    project_name = models.CharField(max_length=100)
    employees = models.ManyToManyField(Employee)

    def __str__(self):
        return self.project_name
