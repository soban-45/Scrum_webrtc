from django.urls import path
from .views import EndConversationView, ProjectAPIView, EmployeeLastStandupView, webrtc_signal, DownloadExcelView,start_bot

urlpatterns = [
    path("end/", EndConversationView.as_view()),
    path('projects/', ProjectAPIView.as_view(), name='project-list'),
    path('employee-last-standup/',
         EmployeeLastStandupView.as_view(),
         name='employee-last-standup'),
    path('webrtc-signal/', webrtc_signal, name='webrtc-signal'),
    path('download-excel/', DownloadExcelView.as_view(), name='download-excel'),
    path('start-bot/', start_bot, name='start-bot'),
]
