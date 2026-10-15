# People query fix

The production `/admin/people` query must include every selected non-aggregated profile-image column in `GROUP BY`.

Required columns:

```sql
GROUP BY
  u.id,
  dp.profile_image_key,
  gp.profile_image_key
```

Apply this to both `listPeople()` and `getPerson()` queries in `src/modules/admin/people.service.ts`.
