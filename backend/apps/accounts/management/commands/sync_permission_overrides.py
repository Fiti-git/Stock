"""
One-shot maintenance command for permissions_override lists.

Two categories of drift accumulate over time:
  1. New nav codes were added to ROLE_DEFAULTS after some users already had
     an override snapshot taken → those users can't see the new page even
     though the role-default upgrade should have granted it.
  2. A permission code was added to a user override that shouldn't be there
     for their role (e.g. a manager somehow got `nav.admin_dashboard`).

Usage:
  # Grant a code to every user of a given role whose override lacks it
  python manage.py sync_permission_overrides --grant nav.daily_ops --role manager
  python manage.py sync_permission_overrides --grant nav.daily_ops --role admin

  # Remove a code from every user of a given role whose override has it
  python manage.py sync_permission_overrides --revoke nav.admin_dashboard --role manager

Idempotent. Multiple --grant / --revoke pairs can be chained.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User


class Command(BaseCommand):
    help = "Grant or revoke a permission code on the override lists of users with a given role."

    def add_arguments(self, parser):
        parser.add_argument("--grant", action="append", default=[], help="Permission code to add (may be repeated).")
        parser.add_argument("--revoke", action="append", default=[], help="Permission code to remove (may be repeated).")
        parser.add_argument(
            "--role", required=True,
            help="Restrict to users with this role (manager / admin / super_admin / staff / store_user).",
        )
        parser.add_argument("--dry-run", action="store_true", help="Report changes without saving.")

    def handle(self, *args, **opts):
        role = opts["role"]
        grants = opts["grant"] or []
        revokes = opts["revoke"] or []
        dry = opts["dry_run"]

        if not grants and not revokes:
            raise CommandError("Provide at least one --grant or --revoke code.")

        overlap = set(grants) & set(revokes)
        if overlap:
            raise CommandError(f"Codes in both --grant and --revoke: {overlap}")

        qs = User.objects.filter(role=role, permissions_override__isnull=False)
        touched = 0
        for user in qs:
            override = list(user.permissions_override or [])
            before = set(override)
            after = set(override)
            after.update(grants)
            after.difference_update(revokes)
            if after != before:
                new_list = [c for c in override if c not in revokes]
                for c in grants:
                    if c not in new_list:
                        new_list.append(c)
                user.permissions_override = new_list
                touched += 1
                self.stdout.write(
                    f"  {user.username} ({role}): "
                    f"+{sorted(after - before)} -{sorted(before - after)}"
                )
                if not dry:
                    user.save(update_fields=["permissions_override"])

        if dry:
            self.stdout.write(self.style.WARNING(f"[dry-run] Would touch {touched} user(s)."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Done. Touched {touched} user(s)."))
