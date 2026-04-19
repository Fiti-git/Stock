"""
Seed initial data:
  - 16 outlets (short codes; admin updates full XLS names via Django admin)
  - Super Admin: superadmin / superadmin123
  - Admin user: admin / admin123
  - Store user for Gohagoda: gohagoda_upload / upload123
  - Manager for Gohagoda: gohagoda_manager / manager123
"""

from django.core.management.base import BaseCommand
from apps.outlets.models import Outlet
from apps.accounts.models import User


OUTLETS = [
    {"outlet_name": "SUPER MARKET:ASFAK",  "short_code": "AS",   "location_code": "0161"},
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

        # Super Admin — can manage per-user permissions
        if not User.objects.filter(username="superadmin").exists():
            user = User(
                username="superadmin",
                role=User.Role.SUPER_ADMIN,
                is_staff=True,
                is_superuser=True,
            )
            user.set_password("superadmin123")
            user.save()
            self.stdout.write(self.style.SUCCESS("  Created super admin: superadmin / superadmin123"))
        else:
            self.stdout.write("  Super admin already exists.")

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
