"""
Seed initial data:
  - 16 outlets (short codes; admin updates full XLS names via Django admin)
  - Admin user: admin / admin123
  - Store user for Gohagoda: gohagoda_upload / upload123
  - Manager for Gohagoda: gohagoda_manager / manager123
"""

from django.core.management.base import BaseCommand
from apps.outlets.models import Outlet
from apps.accounts.models import User


OUTLETS = [
    {"outlet_name": "SUPER MARKET:GOHAGODA",  "short_code": "ASMGOH",   "location_code": "011"},
    {"outlet_name": "SUPER MARKET:SMWAT",      "short_code": "SMWAT",    "location_code": ""},
    {"outlet_name": "SUPER MARKET:ASMHIDA",    "short_code": "ASMHIDA",  "location_code": ""},
    {"outlet_name": "SUPER MARKET:ASMPOLGO",   "short_code": "ASMPOLGO", "location_code": ""},
    {"outlet_name": "SUPER MARKET:EMHIGH",     "short_code": "EMHIGH",   "location_code": ""},
    {"outlet_name": "SUPER MARKET:HAL",        "short_code": "Hal",      "location_code": ""},
    {"outlet_name": "SUPER MARKET:ASMAMP",     "short_code": "ASMAMP",   "location_code": ""},
    {"outlet_name": "SUPER MARKET:WATTA",      "short_code": "Watta",    "location_code": ""},
    {"outlet_name": "SUPER MARKET:SMPUJA",     "short_code": "SMPUJA",   "location_code": ""},
    {"outlet_name": "SUPER MARKET:SMLE",       "short_code": "SMLE",     "location_code": ""},
    {"outlet_name": "SUPER MARKET:SMBARI",     "short_code": "SMBARI",   "location_code": ""},
    {"outlet_name": "SUPER MARKET:EMMEDA",     "short_code": "EMMEDA",   "location_code": ""},
    {"outlet_name": "SUPER MARKET:SMKY",       "short_code": "SMKY",     "location_code": ""},
    {"outlet_name": "SUPER MARKET:MOBI",       "short_code": "MOBI",     "location_code": ""},
    {"outlet_name": "SUPER MARKET:ASMARABE",   "short_code": "ASMARABE", "location_code": ""},
    {"outlet_name": "SUPER MARKET:CBLALA",     "short_code": "CBLALA",   "location_code": ""},
]


class Command(BaseCommand):
    help = "Seed initial outlets and user accounts"

    def handle(self, *args, **options):
        # Outlets
        for data in OUTLETS:
            outlet, created = Outlet.objects.get_or_create(
                outlet_name=data["outlet_name"],
                defaults={
                    "short_code": data["short_code"],
                    "location_code": data["location_code"],
                },
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"  Created outlet: {outlet.outlet_name} ({outlet.short_code})"))
            else:
                # Update short_code if it's missing (for re-runs after migration)
                if not outlet.short_code:
                    outlet.short_code = data["short_code"]
                    outlet.save(update_fields=["short_code"])
                self.stdout.write(f"  Outlet exists: {outlet.outlet_name}")

        gohagoda = Outlet.objects.get(outlet_name="SUPER MARKET:GOHAGODA")

        # Admin
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser(username="admin", password="admin123")
            self.stdout.write(self.style.SUCCESS("  Created admin user: admin / admin123"))
        else:
            self.stdout.write("  Admin user already exists.")

        # Store user
        if not User.objects.filter(username="gohagoda_upload").exists():
            User.objects.create_user(
                username="gohagoda_upload",
                password="upload123",
                role=User.Role.STORE_USER,
                outlet=gohagoda,
            )
            self.stdout.write(self.style.SUCCESS("  Created store user: gohagoda_upload / upload123"))
        else:
            self.stdout.write("  Store user already exists.")

        # Manager
        if not User.objects.filter(username="gohagoda_manager").exists():
            User.objects.create_user(
                username="gohagoda_manager",
                password="manager123",
                role=User.Role.MANAGER,
                outlet=gohagoda,
            )
            self.stdout.write(self.style.SUCCESS("  Created manager: gohagoda_manager / manager123"))
        else:
            self.stdout.write("  Manager already exists.")

        self.stdout.write(self.style.SUCCESS("\nSeed complete."))
