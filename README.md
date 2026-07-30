# Lika Barbershop – website dygjuhëshe

Ky version përmban:

- Faqe moderne responsive në shqip dhe anglisht.
- SEO lokal për frazën “best barber shop in Tirana”.
- Meta title/description, canonical, hreflang, Open Graph dhe JSON-LD LocalBusiness.
- `robots.txt`, `sitemap.xml`, favicon dhe manifest.
- Panel administrimi për oraret, fotot e galerisë dhe reklamat.
- Ngarkim fotosh JPG, PNG ose WEBP deri në 6 MB.
- Hyrje administratori me fjalëkalim të enkriptuar me `scrypt`.

## Nisja lokale

```bash
npm start
```

Pastaj hap:

- Faqja: `http://localhost:3000`
- Anglisht: `http://localhost:3000/en.html`
- Administrimi: `http://localhost:3000/admin.html`

Në hapjen e parë të panelit do të kërkohet krijimi i fjalëkalimit. Skedari i kredencialeve krijohet te `data/admin.json` dhe nuk duhet publikuar në Git.

## Publikimi në hosting

Nuk ka varësi të jashtme npm. Hostimi duhet të mbështesë Node.js 18 ose më të ri dhe ruajtje persistente për dosjet `data/` dhe `uploads/`. Komanda e nisjes është:

```bash
npm start
```

Aktivizo HTTPS dhe vendos `NODE_ENV=production` në hosting. Domaini i përdorur te SEO është `https://likabarbers.com`. Nëse domaini ndryshon, zëvendësoje në `index.html`, `en.html`, faqet e produkteve, `robots.txt` dhe `sitemap.xml`.

## Hapat e rëndësishëm për Google

1. Publiko faqen në domainin final me HTTPS.
2. Verifiko `https://likabarbers.com` në Google Search Console.
3. Dërgo `https://likabarbers.com/sitemap.xml`.
4. Plotëso dhe përditëso Google Business Profile me të njëjtin emër, adresë, telefon dhe orar si në faqe.
5. Shto foto reale rregullisht dhe kërko vlerësime autentike nga klientët.

Fraza “best barber shop in Tirana” është vendosur natyrshëm në titull, përshkrim dhe H1. Renditja në Google nuk garantohet vetëm nga kodi; ndikohet edhe nga Google Business Profile, vlerësimet, lidhjet, konkurrenca dhe historiku i domainit.
