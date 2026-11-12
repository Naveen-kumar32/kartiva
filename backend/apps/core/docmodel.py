"""DocModel: a row = one record in the SAME camelCase shape the frontend uses (`data` JSONB), plus indexed
columns copied from it on save for fast filtering. `data` is the source of truth; columns are projections.

    class Store(DocModel):
        slug = models.SlugField(unique=True)
        status = models.CharField(max_length=20, db_index=True)
        INDEX = {"slug": "slug", "status": "status"}
"""
from django.db import models


class DocModel(models.Model):
    data = models.JSONField(default=dict)
    INDEX: dict = {}

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.pk is None and not self._meta.pk.auto_created and not isinstance(self._meta.pk, models.AutoField):
            from django.db.models import Max  # explicit integer PKs (catalogue ids) → next free id
            self.pk = self.data.get("id") or (type(self).objects.aggregate(m=Max("pk"))["m"] or 0) + 1
        for column, key in self.INDEX.items():  # "buyer.email" style paths reach into nested objects
            value = self.data
            for part in key.split("."):
                value = value.get(part) if isinstance(value, dict) else None
            setattr(self, column, value)
        super().save(*args, **kwargs)
        if self.data.get("id") != self.pk:  # keep data.id == primary key (new rows get their id after insert)
            self.data["id"] = self.pk
            type(self).objects.filter(pk=self.pk).update(data=self.data)

    def to_dict(self):
        return dict(self.data)

    @classmethod
    def create(cls, data, **extra):
        obj = cls(data=data, **extra)
        obj.save()
        return obj

    def update(self, **fields):
        self.data.update(fields)
        self.save()
        return self
