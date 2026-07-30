# Lika Barbershop — versioni për Netlify

Ky version përdor:

- `public/` për faqen statike;
- `netlify/functions/` për API-n e panelit admin;
- Netlify Blobs për oraret, reklamat, fotot dhe kredencialet e administratorit.

## Publikimi nga GitHub

1. Zëvendësoni skedarët e repository-t me skedarët e këtij projekti.
2. Bëni commit dhe push në GitHub.
3. Netlify do të lexojë automatikisht `netlify.toml`.
4. Te Netlify kontrolloni që Publish directory të jetë `public` dhe Functions directory `netlify/functions`.
5. Pas deploy-it hapni `/admin` dhe krijoni fjalëkalimin e parë me të paktën 10 karaktere.

Mos e ngarkoni vetëm dosjen `public`, sepse paneli admin ka nevojë edhe për `netlify/functions`, `package.json` dhe `netlify.toml`.

## Ruajtja

Të dhënat ruhen në store-t e Netlify Blobs:

- `lika-content`
- `lika-private`
- `lika-media`

Fotot e ngarkuara nga paneli admin mund të jenë JPG, PNG ose WEBP, maksimumi 4 MB.
