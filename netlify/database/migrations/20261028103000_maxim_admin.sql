-- HQ is alleen nog voor maxim@sitemaker.nl (27-10-2026); dat account moet dan ook beheerder zijn
-- (anders ontbreken o.a. instellingen, team en "Klant verwijderen").
UPDATE users SET role = 'admin', active = TRUE WHERE lower(email) = 'maxim@sitemaker.nl' AND role <> 'klant';
