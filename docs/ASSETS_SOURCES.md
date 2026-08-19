# Fuentes de assets 3D

Este proyecto se desarrolla con geometría placeholder (cajas, formas
low-poly) desde la Fase 1 para no depender de assets externos durante el
desarrollo. Este documento es la guía para reemplazar esos placeholders
por modelos reales manualmente, más adelante (Fase 11).

**Ninguna URL de descarga directa está incluida acá a propósito.** Cada
banco se visita manualmente para elegir el modelo/textura puntual y
confirmar su licencia antes de descargar — eso no se puede automatizar
de forma confiable ni segura.

## Bancos recomendados

| Banco | Qué sacar de ahí | Notas de licencia |
|---|---|---|
| [Kenney.nl](https://kenney.nl/assets) | Packs completos de autos y pistas low-poly (`Racing Kit`, `Car Kit`) pensados justo para este tipo de proyecto. | Todo el contenido de Kenney es CC0 (dominio público) — el más seguro de todos, sin atribución requerida. |
| [Poly Pizza](https://poly.pizza/) | Modelos low-poly sueltos (autos, props de ambiente: conos, vallas, árboles). | Licencia varía por modelo (CC0 o CC-BY) — revisar cada ficha antes de bajar. |
| [Sketchfab](https://sketchfab.com/) | Modelos de mayor detalle, filtrando por "Downloadable" + licencia CC0/CC-BY. | Licencia varía muchísimo por autor — leer los términos de cada modelo, no asumir. |
| [ambientCG](https://ambientcg.com/) | Texturas PBR (asfalto, césped, tierra, grava) para materiales realistas de pista. | Todo CC0. |
| [OpenGameArt](https://opengameart.org/) | Props de ambiente, texturas sueltas, algún modelo de vehículo. | Licencia varía por entrada — revisar cada una. |
| [Poliigon](https://www.poliigon.com/) (opcional, tiene plan gratuito limitado) | Texturas PBR de alta calidad alternativas a ambientCG. | Plan free limitado en descargas mensuales. |

## Convención de archivos

El loader (`GLTFLoader`, se agrega en la Fase 11) va a esperar los
modelos en estas rutas, así que al descargar hay que renombrar/mover el
archivo a:

```
public/assets/models/cars/<id-del-auto-en-cars.json>.glb
public/assets/models/tracks/<id-de-la-pista-en-tracks.json>.glb
public/assets/textures/<nombre-textura>.jpg|png
public/assets/sounds/<nombre-sonido>.mp3|ogg
```

El `id` es el mismo que usa el auto/pista en `src/data/cars.json` /
`src/data/tracks.json` — así el código no necesita ningún mapeo manual,
solo busca `models/cars/${car.id}.glb`.

## Registro de assets usados

Cuando se reemplace un placeholder por un modelo real, documentar acá:
origen exacto (link a la ficha del asset, no a la descarga directa),
autor, y tipo de licencia. Se completa a partir de la Fase 11.
