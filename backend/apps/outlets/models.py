from django.db import models


class Outlet(models.Model):
    outlet_name = models.CharField(max_length=200, unique=True)
    short_code = models.CharField(max_length=20, blank=True, default="")
    location_code = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "outlets"
        ordering = ["outlet_name"]

    def __str__(self):
        return self.outlet_name
