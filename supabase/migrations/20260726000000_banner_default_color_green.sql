-- New banners created without an explicit bg_color previously defaulted to
-- near-black (#111827, a leftover from the old fashion-store theme). Default
-- to the Leomed Pharma brand green instead.
alter table public.banners alter column bg_color set default '#145c3a';
