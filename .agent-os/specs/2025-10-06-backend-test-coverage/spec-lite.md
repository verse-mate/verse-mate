# Spec Summary (Lite)

Increase backend plugin test coverage by targeting simple "low hanging fruit" endpoints (CRUD operations, static queries) that don't require complex AI or queue mocking. Current coverage is 63.81% functions / 74.43% lines overall, but entire plugins (bible, admin, healthcheck) have 0% coverage. Focus on healthcheck, user, bible bookmarks/notes/highlights, and admin CRUD endpoints to improve overall coverage to 75-80% functions / 80-85% lines and establish testing patterns for future work.
