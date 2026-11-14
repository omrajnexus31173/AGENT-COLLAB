-- CSRF tokens are variable-length base64url values. Blank padding must never
-- become part of a constant-time comparison against the browser header.
ALTER TABLE sessions ALTER COLUMN csrf_token TYPE varchar(64) USING rtrim(csrf_token);
