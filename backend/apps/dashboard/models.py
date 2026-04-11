from django.db import models


class StockCount(models.Model):
    outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.CASCADE,
        related_name="stock_counts",
    )
    item = models.ForeignKey(
        "items.Item",
        on_delete=models.CASCADE,
        related_name="stock_counts",
    )
    count_date = models.DateField()
    actual_qty = models.DecimalField(max_digits=12, decimal_places=3)
    location_tag = models.CharField(max_length=100, blank=True, default="")
    counted_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="stock_counts",
    )
    counted_at = models.DateTimeField(auto_now_add=True)
    is_month_end = models.BooleanField(default=False)

    class Meta:
        db_table = "stock_counts"
        ordering = ["-counted_at"]

    def __str__(self):
        return f"{self.outlet} / {self.item.item_code} @ {self.count_date} = {self.actual_qty}"
