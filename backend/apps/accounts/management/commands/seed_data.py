"""
Seed minimal bootstrap accounts. Re-runs are idempotent (skips users that
already exist) so this can be invoked after any deploy without clobbering
data that the real admins have set up in the running system.

  - Super Admin: superadmin / superadmin123
  - Admin:       admin / admin123

Outlets, store users, and managers are created by the admins themselves
through the Users / Outlets pages, not by this seeder.
"""

from django.core.management.base import BaseCommand
from apps.accounts.models import User


class Command(BaseCommand):
    help = "Seed the two bootstrap accounts (super admin + admin)."

    def handle(self, *args, **options):
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

        self.stdout.write(self.style.SUCCESS("\nSeed complete."))
