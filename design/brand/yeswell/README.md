# Yeswell logo files

Colors: Ink #13303A · Clay #C2602F · On dark: Mist #EEF3F3 and Light clay #E08456.
Wordmark: DM Serif Display ("Yes") and DM Serif Display Italic ("well"), converted to outlines, so no font is needed.

## SVG (use these on the website)
- yeswell-logo.svg / -reversed: horizontal logo for headers (reversed = on dark backgrounds)
- yeswell-logo-stacked.svg / -reversed: mark above the wordmark, for centered spots
- yeswell-wordmark.svg / -reversed: name only
- yeswell-mark.svg / -reversed / -mono: the symbol alone (mono uses currentColor, so it takes the text color)
- yeswell-app-icon.svg: rounded-square icon
- favicon.svg: 32px icon, simplified for small sizes
- yeswell-social-1200x630.svg: social share image

## PNG
- yeswell-logo.png, yeswell-logo-4x.png, yeswell-logo-reversed-4x.png
- yeswell-mark-512.png, yeswell-app-icon-512.png, icon-192.png, apple-touch-icon.png (180)
- favicon-32.png, favicon-16.png
- yeswell-social-1200x630.png (Open Graph)

## HTML head
```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:image" content="/yeswell-social-1200x630.png">
```

## Clear space and minimum size
- Keep clear space around the logo equal to the height of the clay circle.
- Horizontal logo: at least 96px wide on screen. Below 24px, use favicon.svg.
