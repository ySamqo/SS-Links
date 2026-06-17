create table if not exists smart_links (
  id bigserial primary key,
  title text not null,
  slug text unique not null,
  destination_url text not null,
  deeplink_url text,
  deeplink_enabled integer default 0,
  source text,
  user_id bigint,
  is_active integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists users (
  id bigserial primary key,
  username text unique not null,
  password_hash text not null,
  role text default 'user',
  created_at timestamptz default now()
);

create table if not exists analytics_events (
  id bigserial primary key,
  smart_link_id bigint references smart_links(id) on delete set null,
  event_type text not null,
  country text default 'Unknown',
  created_at timestamptz default now()
);
