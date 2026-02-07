from django.urls import path
from . import views

app_name = 'telegram'

urlpatterns = [
    path('config/',       views.TelegramConfigView.as_view(),  name='config'),
    path('send-otp/',     views.SendOtpView.as_view(),         name='send-otp'),
    path('verify-otp/',   views.VerifyOtpView.as_view(),       name='verify-otp'),
    path('group-media/',  views.GroupMediaView.as_view(),       name='group-media'),
    path('download/',     views.TelegramDownloadView.as_view(), name='download'),
    path('cancel/',       views.CancelDownloadView.as_view(),   name='cancel'),
    path('status/',       views.DownloadStatusView.as_view(),   name='status'),
]
