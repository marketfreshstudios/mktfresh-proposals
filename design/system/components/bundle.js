/* @ds-bundle: {"format":4,"namespace":"ProposalDS","components":[{"name":"Icon"},{"name":"Button"},{"name":"StatusPill"},{"name":"JobState"},{"name":"TotalsPair"},{"name":"PricingTable"},{"name":"Banner"},{"name":"Field"},{"name":"Checkbox"},{"name":"SignaturePad"},{"name":"DataTable"},{"name":"EmptyState"},{"name":"ReadinessChecklist"},{"name":"VariableChip"},{"name":"AuditTrail"},{"name":"StickyActionBar"},{"name":"Badge"},{"name":"FilterChip"},{"name":"Toolbar"}]} */
(function (global) {
  "use strict";
  // React is resolved at call time, not load time: a host page may attach
  // window.React after this script runs.
  function R() {
    var Rx = global.React;
    if (!Rx) throw new Error("ProposalDS: window.React is not available yet.");
    return Rx;
  }
  function h() { var Rx = R(); return Rx.createElement.apply(Rx, arguments); }

  /* Font Awesome Free 6.7.2 (Solid) by @fontawesome - https://fontawesome.com
     Icons: CC BY 4.0 - https://fontawesome.com/license/free */
  var ICONS = {"edit":{"viewBox":"0 0 512 512","d":"M471.6 21.7c-21.9-21.9-57.3-21.9-79.2 0L362.3 51.7l97.9 97.9 30.1-30.1c21.9-21.9 21.9-57.3 0-79.2L471.6 21.7zm-299.2 220c-6.1 6.1-10.8 13.6-13.5 21.9l-29.6 88.8c-2.9 8.6-.6 18.1 5.8 24.6s15.9 8.7 24.6 5.8l88.8-29.6c8.2-2.7 15.7-7.4 21.9-13.5L437.7 172.3 339.7 74.3 172.4 241.7zM96 64C43 64 0 107 0 160L0 416c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-96c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 96c0 17.7-14.3 32-32 32L96 448c-17.7 0-32-14.3-32-32l0-256c0-17.7 14.3-32 32-32l96 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L96 64z"},"send":{"viewBox":"0 0 512 512","d":"M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 427.7l-68.5 74.1c-8.9 9.7-22.9 12.9-35.2 8.1S160 493.2 160 480l0-83.6c0-4 1.5-7.8 4.2-10.8L331.8 202.8c5.8-6.3 5.6-16-.4-22s-15.7-6.4-22-.7L106 360.8 17.7 316.6C7.1 311.3 .3 300.7 0 288.9s5.9-22.8 16.1-28.7l448-256c10.7-6.1 23.9-5.5 34 1.4z"},"viewed":{"viewBox":"0 0 576 512","d":"M288 32c-80.8 0-145.5 36.8-192.6 80.6C48.6 156 17.3 208 2.5 243.7c-3.3 7.9-3.3 16.7 0 24.6C17.3 304 48.6 356 95.4 399.4C142.5 443.2 207.2 480 288 480s145.5-36.8 192.6-80.6c46.8-43.5 78.1-95.4 93-131.1c3.3-7.9 3.3-16.7 0-24.6c-14.9-35.7-46.2-87.7-93-131.1C433.5 68.8 368.8 32 288 32zM144 256a144 144 0 1 1 288 0 144 144 0 1 1 -288 0zm144-64c0 35.3-28.7 64-64 64c-7.1 0-13.9-1.2-20.3-3.3c-5.5-1.8-11.9 1.6-11.7 7.4c.3 6.9 1.3 13.8 3.2 20.7c13.7 51.2 66.4 81.6 117.6 67.9s81.6-66.4 67.9-117.6c-11.1-41.5-47.8-69.4-88.6-71.1c-5.8-.2-9.2 6.1-7.4 11.7c2.1 6.4 3.3 13.2 3.3 20.3z"},"signature":{"viewBox":"0 0 640 512","d":"M192 128c0-17.7 14.3-32 32-32s32 14.3 32 32l0 7.8c0 27.7-2.4 55.3-7.1 82.5l-84.4 25.3c-40.6 12.2-68.4 49.6-68.4 92l0 71.9c0 40 32.5 72.5 72.5 72.5c26 0 50-13.9 62.9-36.5l13.9-24.3c26.8-47 46.5-97.7 58.4-150.5l94.4-28.3-12.5 37.5c-3.3 9.8-1.6 20.5 4.4 28.8s15.7 13.3 26 13.3l128 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-83.6 0 18-53.9c3.8-11.3 .9-23.8-7.4-32.4s-20.7-11.8-32.2-8.4L316.4 198.1c2.4-20.7 3.6-41.4 3.6-62.3l0-7.8c0-53-43-96-96-96s-96 43-96 96l0 32c0 17.7 14.3 32 32 32s32-14.3 32-32l0-32zm-9.2 177l49-14.7c-10.4 33.8-24.5 66.4-42.1 97.2l-13.9 24.3c-1.5 2.6-4.3 4.3-7.4 4.3c-4.7 0-8.5-3.8-8.5-8.5l0-71.9c0-14.1 9.3-26.6 22.8-30.7zM24 368c-13.3 0-24 10.7-24 24s10.7 24 24 24l40.3 0c-.2-2.8-.3-5.6-.3-8.5L64 368l-40 0zm592 48c13.3 0 24-10.7 24-24s-10.7-24-24-24l-310.1 0c-6.7 16.3-14.2 32.3-22.3 48L616 416z"},"verified":{"viewBox":"0 0 512 512","d":"M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"},"declined":{"viewBox":"0 0 512 512","d":"M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"},"expired":{"viewBox":"0 0 384 512","d":"M32 0C14.3 0 0 14.3 0 32S14.3 64 32 64l0 11c0 42.4 16.9 83.1 46.9 113.1L146.7 256 78.9 323.9C48.9 353.9 32 394.6 32 437l0 11c-17.7 0-32 14.3-32 32s14.3 32 32 32l32 0 256 0 32 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l0-11c0-42.4-16.9-83.1-46.9-113.1L237.3 256l67.9-67.9c30-30 46.9-70.7 46.9-113.1l0-11c17.7 0 32-14.3 32-32s-14.3-32-32-32L320 0 64 0 32 0zM96 75l0-11 192 0 0 11c0 25.5-10.1 49.9-28.1 67.9L192 210.7l-67.9-67.9C106.1 124.9 96 100.4 96 75z"},"archive":{"viewBox":"0 0 512 512","d":"M32 32l448 0c17.7 0 32 14.3 32 32l0 32c0 17.7-14.3 32-32 32L32 128C14.3 128 0 113.7 0 96L0 64C0 46.3 14.3 32 32 32zm0 128l448 0 0 256c0 35.3-28.7 64-64 64L96 480c-35.3 0-64-28.7-64-64l0-256zm128 80c0 8.8 7.2 16 16 16l160 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-160 0c-8.8 0-16 7.2-16 16z"},"lock":{"viewBox":"0 0 448 512","d":"M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"},"clock":{"viewBox":"0 0 512 512","d":"M256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zM232 120l0 136c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2 280 120c0-13.3-10.7-24-24-24s-24 10.7-24 24z"},"running":{"viewBox":"0 0 512 512","d":"M304 48a48 48 0 1 0 -96 0 48 48 0 1 0 96 0zm0 416a48 48 0 1 0 -96 0 48 48 0 1 0 96 0zM48 304a48 48 0 1 0 0-96 48 48 0 1 0 0 96zm464-48a48 48 0 1 0 -96 0 48 48 0 1 0 96 0zM142.9 437A48 48 0 1 0 75 369.1 48 48 0 1 0 142.9 437zm0-294.2A48 48 0 1 0 75 75a48 48 0 1 0 67.9 67.9zM369.1 437A48 48 0 1 0 437 369.1 48 48 0 1 0 369.1 437z"},"failed":{"viewBox":"0 0 512 512","d":"M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"},"review":{"viewBox":"0 0 512 512","d":"M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3l58.3 0c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24l0-13.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1l-58.3 0c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"},"stale":{"viewBox":"0 0 512 512","d":"M75 75L41 41C25.9 25.9 0 36.6 0 57.9L0 168c0 13.3 10.7 24 24 24l110.1 0c21.4 0 32.1-25.9 17-41l-30.8-30.8C155 85.5 203 64 256 64c106 0 192 86 192 192s-86 192-192 192c-40.8 0-78.6-12.7-109.7-34.4c-14.5-10.1-34.4-6.6-44.6 7.9s-6.6 34.4 7.9 44.6C151.2 495 201.7 512 256 512c141.4 0 256-114.6 256-256S397.4 0 256 0C185.3 0 121.3 28.7 75 75zm181 53c-13.3 0-24 10.7-24 24l0 104c0 6.4 2.5 12.5 7 17l72 72c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-65-65 0-94.1c0-13.3-10.7-24-24-24z"},"retry":{"viewBox":"0 0 512 512","d":"M463.5 224l8.5 0c13.3 0 24-10.7 24-24l0-128c0-9.7-5.8-18.5-14.8-22.2s-19.3-1.7-26.2 5.2L413.4 96.6c-87.6-86.5-228.7-86.2-315.8 1c-87.5 87.5-87.5 229.3 0 316.8s229.3 87.5 316.8 0c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0c-62.5 62.5-163.8 62.5-226.3 0s-62.5-163.8 0-226.3c62.2-62.2 162.7-62.5 225.3-1L327 183c-6.9 6.9-8.9 17.2-5.2 26.2s12.5 14.8 22.2 14.8l119.5 0z"},"ai":{"viewBox":"0 0 576 512","d":"M234.7 42.7L197 56.8c-3 1.1-5 4-5 7.2s2 6.1 5 7.2l37.7 14.1L248.8 123c1.1 3 4 5 7.2 5s6.1-2 7.2-5l14.1-37.7L315 71.2c3-1.1 5-4 5-7.2s-2-6.1-5-7.2L277.3 42.7 263.2 5c-1.1-3-4-5-7.2-5s-6.1 2-7.2 5L234.7 42.7zM46.1 395.4c-18.7 18.7-18.7 49.1 0 67.9l34.6 34.6c18.7 18.7 49.1 18.7 67.9 0L529.9 116.5c18.7-18.7 18.7-49.1 0-67.9L495.3 14.1c-18.7-18.7-49.1-18.7-67.9 0L46.1 395.4zM484.6 82.6l-105 105-23.3-23.3 105-105 23.3 23.3zM7.5 117.2C3 118.9 0 123.2 0 128s3 9.1 7.5 10.8L64 160l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L128 160l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L128 96 106.8 39.5C105.1 35 100.8 32 96 32s-9.1 3-10.8 7.5L64 96 7.5 117.2zm352 256c-4.5 1.7-7.5 6-7.5 10.8s3 9.1 7.5 10.8L416 416l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L480 416l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L480 352l-21.2-56.5c-1.7-4.5-6-7.5-10.8-7.5s-9.1 3-10.8 7.5L416 352l-56.5 21.2z"},"download":{"viewBox":"0 0 512 512","d":"M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 242.7-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7 288 32zM64 352c-35.3 0-64 28.7-64 64l0 32c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-32c0-35.3-28.7-64-64-64l-101.5 0-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352 64 352zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"},"recurring":{"viewBox":"0 0 512 512","d":"M0 224c0 17.7 14.3 32 32 32s32-14.3 32-32c0-53 43-96 96-96l160 0 0 32c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l64-64c12.5-12.5 12.5-32.8 0-45.3l-64-64c-9.2-9.2-22.9-11.9-34.9-6.9S320 19.1 320 32l0 32L160 64C71.6 64 0 135.6 0 224zm512 64c0-17.7-14.3-32-32-32s-32 14.3-32 32c0 53-43 96-96 96l-160 0 0-32c0-12.9-7.8-24.6-19.8-29.6s-25.7-2.2-34.9 6.9l-64 64c-12.5 12.5-12.5 32.8 0 45.3l64 64c9.2 9.2 22.9 11.9 34.9 6.9s19.8-16.6 19.8-29.6l0-32 160 0c88.4 0 160-71.6 160-160z"},"one-time":{"viewBox":"0 0 384 512","d":"M14 2.2C22.5-1.7 32.5-.3 39.6 5.8L80 40.4 120.4 5.8c9-7.7 22.3-7.7 31.2 0L192 40.4 232.4 5.8c9-7.7 22.3-7.7 31.2 0L304 40.4 344.4 5.8c7.1-6.1 17.1-7.5 25.6-3.6s14 12.4 14 21.8l0 464c0 9.4-5.5 17.9-14 21.8s-18.5 2.5-25.6-3.6L304 471.6l-40.4 34.6c-9 7.7-22.3 7.7-31.2 0L192 471.6l-40.4 34.6c-9 7.7-22.3 7.7-31.2 0L80 471.6 39.6 506.2c-7.1 6.1-17.1 7.5-25.6 3.6S0 497.4 0 488L0 24C0 14.6 5.5 6.1 14 2.2zM96 144c-8.8 0-16 7.2-16 16s7.2 16 16 16l192 0c8.8 0 16-7.2 16-16s-7.2-16-16-16L96 144zM80 352c0 8.8 7.2 16 16 16l192 0c8.8 0 16-7.2 16-16s-7.2-16-16-16L96 336c-8.8 0-16 7.2-16 16zM96 240c-8.8 0-16 7.2-16 16s7.2 16 16 16l192 0c8.8 0 16-7.2 16-16s-7.2-16-16-16L96 240z"},"link":{"viewBox":"0 0 640 512","d":"M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"},"copy":{"viewBox":"0 0 448 512","d":"M208 0L332.1 0c12.7 0 24.9 5.1 33.9 14.1l67.9 67.9c9 9 14.1 21.2 14.1 33.9L448 336c0 26.5-21.5 48-48 48l-192 0c-26.5 0-48-21.5-48-48l0-288c0-26.5 21.5-48 48-48zM48 128l80 0 0 64-64 0 0 256 192 0 0-32 64 0 0 48c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 176c0-26.5 21.5-48 48-48z"},"search":{"viewBox":"0 0 512 512","d":"M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"},"plus":{"viewBox":"0 0 448 512","d":"M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 144L48 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l144 0 0 144c0 17.7 14.3 32 32 32s32-14.3 32-32l0-144 144 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-144 0 0-144z"},"check":{"viewBox":"0 0 448 512","d":"M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"},"chevron-right":{"viewBox":"0 0 320 512","d":"M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"},"close":{"viewBox":"0 0 384 512","d":"M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"},"document":{"viewBox":"0 0 384 512","d":"M64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-288-128 0c-17.7 0-32-14.3-32-32L224 0 64 0zM256 0l0 128 128 0L256 0zM112 256l160 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64l160 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64l160 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16z"},"pdf":{"viewBox":"0 0 512 512","d":"M0 64C0 28.7 28.7 0 64 0L224 0l0 128c0 17.7 14.3 32 32 32l128 0 0 144-208 0c-35.3 0-64 28.7-64 64l0 144-48 0c-35.3 0-64-28.7-64-64L0 64zm384 64l-128 0L256 0 384 128zM176 352l32 0c30.9 0 56 25.1 56 56s-25.1 56-56 56l-16 0 0 32c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-48 0-80c0-8.8 7.2-16 16-16zm32 80c13.3 0 24-10.7 24-24s-10.7-24-24-24l-16 0 0 48 16 0zm96-80l32 0c26.5 0 48 21.5 48 48l0 64c0 26.5-21.5 48-48 48l-32 0c-8.8 0-16-7.2-16-16l0-128c0-8.8 7.2-16 16-16zm32 128c8.8 0 16-7.2 16-16l0-64c0-8.8-7.2-16-16-16l-16 0 0 96 16 0zm80-112c0-8.8 7.2-16 16-16l48 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-32 0 0 32 32 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-32 0 0 48c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-64 0-64z"},"countersign":{"viewBox":"0 0 640 512","d":"M96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM0 482.3C0 383.8 79.8 304 178.3 304l91.4 0C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7L29.7 512C13.3 512 0 498.7 0 482.3zM625 177L497 305c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L591 143c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"},"more":{"viewBox":"0 0 448 512","d":"M8 256a56 56 0 1 1 112 0A56 56 0 1 1 8 256zm160 0a56 56 0 1 1 112 0 56 56 0 1 1 -112 0zm216-56a56 56 0 1 1 0 112 56 56 0 1 1 0-112z"},"image":{"viewBox":"0 0 512 512","d":"M0 96C0 60.7 28.7 32 64 32l384 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zM323.8 202.5c-4.5-6.6-11.9-10.5-19.8-10.5s-15.4 3.9-19.8 10.5l-87 127.6L170.7 297c-4.6-5.7-11.5-9-18.7-9s-14.2 3.3-18.7 9l-64 80c-5.8 7.2-6.9 17.1-2.9 25.4s12.4 13.6 21.6 13.6l96 0 32 0 208 0c8.9 0 17.1-4.9 21.2-12.8s3.6-17.4-1.4-24.7l-120-176zM112 192a48 48 0 1 0 0-96 48 48 0 1 0 0 96z"},"page-break":{"viewBox":"0 0 512 512","d":"M256 192l-39.5-39.5c4.9-12.6 7.5-26.2 7.5-40.5C224 50.1 173.9 0 112 0S0 50.1 0 112s50.1 112 112 112c14.3 0 27.9-2.7 40.5-7.5L192 256l-39.5 39.5c-12.6-4.9-26.2-7.5-40.5-7.5C50.1 288 0 338.1 0 400s50.1 112 112 112s112-50.1 112-112c0-14.3-2.7-27.9-7.5-40.5L499.2 76.8c7.1-7.1 7.1-18.5 0-25.6c-28.3-28.3-74.1-28.3-102.4 0L256 192zm22.6 150.6L396.8 460.8c28.3 28.3 74.1 28.3 102.4 0c7.1-7.1 7.1-18.5 0-25.6L342.6 278.6l-64 64zM64 112a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm48 240a48 48 0 1 1 0 96 48 48 0 1 1 0-96z"},"variable":{"viewBox":"0 0 640 512","d":"M392.8 1.2c-17-4.9-34.7 5-39.6 22l-128 448c-4.9 17 5 34.7 22 39.6s34.7-5 39.6-22l128-448c4.9-17-5-34.7-22-39.6zm80.6 120.1c-12.5 12.5-12.5 32.8 0 45.3L562.7 256l-89.4 89.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l112-112c12.5-12.5 12.5-32.8 0-45.3l-112-112c-12.5-12.5-32.8-12.5-45.3 0zm-306.7 0c-12.5-12.5-32.8-12.5-45.3 0l-112 112c-12.5 12.5-12.5 32.8 0 45.3l112 112c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256l89.4-89.4c12.5-12.5 12.5-32.8 0-45.3z"}};

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) out.push(arguments[i]);
    return out.join(" ");
  }

  function formatMoney(amount, currency) {
    if (amount === null || amount === undefined) return "";
    var cur = currency || "USD";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency", currency: cur,
        minimumFractionDigits: 2, maximumFractionDigits: 2
      }).format(amount);
    } catch (e) {
      return cur + " " + Number(amount).toFixed(2);
    }
  }

  /* ---------------------------------------------------------------- Icon */
  function Icon(props) {
    var def = ICONS[props.name];
    if (!def) return null;
    var size = props.size || 16;
    return h("svg", {
      className: cx("ps-icon", props.className),
      viewBox: def.viewBox,
      height: size,
      width: size * (parseFloat(def.viewBox.split(" ")[2]) / parseFloat(def.viewBox.split(" ")[3])),
      role: props.title ? "img" : undefined,
      "aria-label": props.title || undefined,
      "aria-hidden": props.title ? undefined : "true",
      focusable: "false",
      style: props.style
    }, h("path", { d: def.d, fill: "currentColor" }));
  }

  /* -------------------------------------------------------------- Button */
  var BTN_SIZE = { sm: "ps-btn--sm", md: "", lg: "ps-btn--lg", xl: "ps-btn--xl" };
  function Button(props) {
    var variant = props.variant || "secondary";
    var busy = !!props.loading;
    var btn = h("button", {
      type: props.type || "button",
      className: cx("ps-btn", "ps-btn--" + variant, BTN_SIZE[props.size || "md"],
        props.block ? "ps-btn--block" : "", props.className),
      disabled: props.disabled || busy,
      onClick: props.onClick,
      "aria-busy": busy ? "true" : undefined
    },
      busy ? h(Icon, { name: "running", size: 16, className: "ps-btn__spinner" })
           : (props.icon ? h(Icon, { name: props.icon, size: 16 }) : null),
      h("span", null, busy && props.loadingLabel ? props.loadingLabel : props.children)
    );
    if (!props.note) return btn;
    return h("span", null, btn, h("span", { className: "ps-btn-note" }, props.note));
  }

  /* ---------------------------------------------------------- StatusPill */
  var STATUS = {
    draft:     { tone: "neutral", icon: "edit",      label: "Draft" },
    sent:      { tone: "info",    icon: "send",      label: "Sent" },
    viewed:    { tone: "info",    icon: "viewed",    label: "Viewed" },
    signed:    { tone: "warning", icon: "signature", label: "Signed by client" },
    completed: { tone: "success", icon: "verified",  label: "Completed" },
    declined:  { tone: "danger",  icon: "declined",  label: "Declined" },
    expired:   { tone: "neutral", icon: "expired",   label: "Expired" },
    archived:  { tone: "neutral", icon: "archive",   label: "Archived" },
    aiDraft:   { tone: "ai",      icon: "ai",        label: "Drafted by AI — needs review" }
  };
  function StatusPill(props) {
    var def = STATUS[props.status];
    if (!def) return null;
    var pill = h("span", {
      className: cx("ps-pill", "ps-tone-" + def.tone, props.className),
      title: props.title
    }, h(Icon, { name: def.icon, size: 14 }), h("span", null, props.label || def.label));
    if (!props.source || props.source === "native") return pill;
    return h("span", { style: { display: "inline-flex", gap: "8px", alignItems: "center" } },
      pill, h("span", { className: "ps-pill ps-pill--outline" }, "Proposify import"));
  }

  /* ------------------------------------------------------------ JobState */
  var JOB = {
    queued:  { tone: "neutral", icon: "clock",   label: "Queued" },
    running: { tone: "info",    icon: "running", label: "Running" },
    failed:  { tone: "danger",  icon: "failed",  label: "Failed" },
    review:  { tone: "warning", icon: "review",  label: "Needs review" }
  };
  function JobState(props) {
    var def = JOB[props.state];
    if (!def) return null;
    var retryable = (props.state === "failed" || props.state === "review") && props.onRetry;
    return h("div", { className: cx("ps-job", props.className) },
      h("span", { className: cx("ps-pill", "ps-tone-" + def.tone) },
        h(Icon, { name: def.icon, size: 14, className: props.state === "running" ? "ps-job__spin" : "" }),
        h("span", null, def.label)),
      h("div", { className: "ps-job__body" },
        h("div", { className: "ps-job__label" }, props.label),
        props.error ? h("div", { className: "ps-job__error" },
          props.error,
          props.attempts ? " · attempt " + props.attempts : "") : null),
      retryable ? h(Button, {
        size: "sm", variant: "secondary", icon: "retry", onClick: props.onRetry
      }, props.state === "review" ? "Resolve" : "Retry") : null
    );
  }

  /* ---------------------------------------------------------- TotalsPair */
  function Total(props) {
    return h("div", { className: "ps-total" },
      h("div", { className: "ps-total__label" },
        h(Icon, { name: props.icon, size: 13 }), h("span", null, props.label)),
      h("div", { className: cx("ps-total__value", "tnum", props.styleClass) },
        props.value,
        props.suffix ? h("span", { className: "ps-total__suffix" }, props.suffix) : null),
      props.note ? h("div", { className: "ps-total__note" }, props.note) : null
    );
  }
  function TotalsPair(props) {
    var cls = props.size === "lg" ? "amount-display" : (props.size === "sm" ? "amount-md" : "amount-lg");
    return h("div", {
      className: cx("ps-totals", props.layout === "stack" ? "ps-totals--stack" : "", props.className)
    },
      h(Total, {
        icon: "one-time", label: "One-time", styleClass: cls,
        value: formatMoney(props.oneTime, props.currency), note: props.oneTimeNote
      }),
      h(Total, {
        icon: "recurring", label: "Monthly", styleClass: cls,
        value: formatMoney(props.monthly, props.currency), suffix: "/month",
        note: props.monthlyNote
      })
    );
  }

  /* ------------------------------------------------------------ Checkbox */
  function Checkbox(props) {
    var locked = !!props.locked;
    var on = !!props.checked;
    return h("label", {
      className: cx("ps-check", on ? "ps-check--on" : "", locked ? "ps-check--locked" : "", props.className)
    },
      h("span", { className: "ps-check__box ps-check__tap" },
        locked ? h(Icon, { name: "lock", size: 11 }) : h(Icon, { name: "check", size: 12 }),
        h("input", {
          type: "checkbox", checked: on, disabled: locked, onChange: props.onChange,
          style: {
            position: "absolute", opacity: 0, width: "100%", height: "100%",
            margin: 0, cursor: locked ? "default" : "pointer"
          }
        })),
      h("span", null, props.children)
    );
  }

  /* -------------------------------------------------------- PricingTable */
  function Line(props) {
    var l = props.line;
    var on = !!l.selected;
    var meta = [];
    if (l.quantity && l.quantity !== 1) meta.push("Qty " + l.quantity);
    if (l.minimumTerm) meta.push(l.minimumTerm + "-month minimum");
    return h("div", {
      className: cx("ps-line", on && l.optional ? "ps-line--on" : "", props.frozen ? "ps-line--frozen" : "")
    },
      h("div", null,
        l.optional
          ? h(Checkbox, {
              checked: on, locked: props.frozen,
              onChange: props.onToggle ? function () { props.onToggle(l.id); } : function () {}
            })
          : h("span", { className: "ps-check__box ps-check__box--locked", title: "Included \u2014 cannot be removed" },
              h(Icon, { name: "lock", size: 11, title: "Included" }))),
      h("div", { style: { minWidth: 0 } },
        h("div", { className: "ps-line__name" }, l.name),
        l.description ? h("div", { className: "ps-line__desc" }, l.description) : null,
        l.schedule ? h("div", { className: "ps-line__meta" },
          h("span", { className: "ps-line__meta-item" },
            h(Icon, { name: "recurring", size: 12 }), h("span", null, l.schedule))) : null,
        meta.length ? h("div", { className: "ps-line__meta" },
          meta.map(function (m, i) {
            return h("span", { className: "ps-line__meta-item", key: i }, m);
          })) : null),
      h("div", { className: cx("ps-line__amount", "amount-md", "tnum") },
        formatMoney(l.amount, props.currency),
        l.cadence === "monthly" ? h("span", { className: "ps-line__cadence" }, "per month") : null,
        l.listPrice && l.listPrice !== l.amount
          ? h("span", { className: cx("ps-line__was", "amount-sm") },
              "was " + formatMoney(l.listPrice, props.currency))
          : null)
    );
  }
  function PricingTable(props) {
    var groups = props.groups || [];
    return h("div", { className: cx("ps-quote", props.className) },
      groups.map(function (g, gi) {
        return h("div", { key: gi },
          h("div", { className: "ps-quote__group" },
            h(Icon, { name: g.cadence === "monthly" ? "recurring" : "one-time", size: 14 }),
            h("span", null, g.title)),
          g.lines.map(function (l) {
            return h(Line, {
              key: l.id, line: l, currency: props.currency,
              frozen: props.frozen, onToggle: props.onToggle
            });
          }));
      }));
  }

  /* -------------------------------------------------------------- Banner */
  var BANNER_ICON = {
    neutral: "document", info: "send", success: "verified",
    warning: "stale", danger: "failed", ai: "ai"
  };
  function Banner(props) {
    var tone = props.tone || "info";
    return h("div", {
      className: cx("ps-banner", "ps-tone-" + tone, props.className),
      role: tone === "danger" ? "alert" : "status"
    },
      h("span", { className: "ps-banner__icon" },
        h(Icon, { name: props.icon || BANNER_ICON[tone], size: 18 })),
      h("div", { className: "ps-banner__body" },
        props.title ? h("p", { className: "ps-banner__title" }, props.title) : null,
        props.children ? h("p", { className: "ps-banner__text" }, props.children) : null,
        props.actions ? h("div", { className: "ps-banner__actions" }, props.actions) : null),
      props.onDismiss
        ? h("button", {
            className: "ps-banner__dismiss", onClick: props.onDismiss, "aria-label": "Dismiss"
          }, h(Icon, { name: "close", size: 14 }))
        : null
    );
  }

  /* --------------------------------------------------------------- Field */
  function Field(props) {
    var id = props.id || ("ps-f-" + (props.name || props.label || "").replace(/\W+/g, "-").toLowerCase());
    var tag = props.multiline ? "textarea" : "input";
    return h("div", {
      className: cx("ps-field", props.size === "lg" ? "ps-field--lg" : "",
        props.error ? "ps-field--invalid" : "", props.className)
    },
      h("label", { className: "ps-field__label", htmlFor: id },
        props.label,
        props.required ? null : h("span", { className: "ps-field__req" }, " (optional)")),
      h(tag, {
        id: id, className: "ps-field__control", type: props.multiline ? undefined : (props.type || "text"),
        value: props.value, placeholder: props.placeholder, disabled: props.disabled,
        rows: props.rows, onChange: props.onChange, readOnly: !props.onChange,
        "aria-invalid": props.error ? "true" : undefined,
        "aria-describedby": props.error ? id + "-err" : (props.hint ? id + "-hint" : undefined)
      }),
      props.error
        ? h("div", { className: "ps-field__error", id: id + "-err" },
            h(Icon, { name: "failed", size: 13 }), h("span", null, props.error))
        : (props.hint ? h("div", { className: "ps-field__hint", id: id + "-hint" }, props.hint) : null)
    );
  }

  /* --------------------------------------------------------- VariableChip */
  function VariableChip(props) {
    if (props.resolved === false) {
      return h("span", { className: "ps-var ps-var--unresolved", title: "This variable has no value yet" },
        h(Icon, { name: "failed", size: 11 }), h("span", null, "{{" + props.name + "}}"));
    }
    if (props.showValue) {
      return h("span", { className: "ps-var ps-var--resolved", title: "{{" + props.name + "}}" }, props.value);
    }
    return h("span", { className: "ps-var", title: props.value }, "{{" + props.name + "}}");
  }

  /* ---------------------------------------------------- ReadinessChecklist */
  var CHECK_TONE = {
    pass: { icon: "verified", color: "var(--success)" },
    fail: { icon: "failed",   color: "var(--danger)" },
    warn: { icon: "review",   color: "var(--warning)" }
  };
  function ReadinessChecklist(props) {
    return h("ul", { className: cx("ps-checklist", props.className) },
      (props.items || []).map(function (it, i) {
        var t = CHECK_TONE[it.state] || CHECK_TONE.warn;
        return h("li", { className: "ps-checklist__item", key: i },
          h("span", { style: { color: t.color, marginTop: "3px" } },
            h(Icon, { name: t.icon, size: 16, title: it.state })),
          h("div", { style: { flex: 1, minWidth: 0 } },
            h("div", { className: "ps-checklist__label" }, it.label),
            it.detail ? h("div", { className: "ps-checklist__detail" }, it.detail) : null),
          it.action || null);
      }));
  }

  /* ----------------------------------------------------------- DataTable */
  function DataTable(props) {
    var cols = props.columns || [];
    if (props.loading) {
      return h("table", { className: "ps-table" },
        h("thead", null, h("tr", null, cols.map(function (c, i) {
          return h("th", { key: i, className: c.numeric ? "ps-num" : "" }, c.header);
        }))),
        h("tbody", null, [0, 1, 2, 3].map(function (r) {
          return h("tr", { key: r }, cols.map(function (c, i) {
            return h("td", { key: i },
              h("span", { className: "ps-skel", style: { width: (40 + ((r + i) % 3) * 20) + "%" } }));
          }));
        })));
    }
    if (!props.rows || !props.rows.length) return props.empty || null;
    return h("table", { className: cx("ps-table", props.className) },
      h("thead", null, h("tr", null, cols.map(function (c, i) {
        return h("th", { key: i, className: c.numeric ? "ps-num" : "" }, c.header);
      }))),
      h("tbody", null, props.rows.map(function (row, ri) {
        return h("tr", { key: row.id || ri }, cols.map(function (c, i) {
          return h("td", { key: i, className: cx(c.numeric ? "ps-num" : "", c.numeric ? "tnum" : "") },
            c.render ? c.render(row) : row[c.key]);
        }));
      })));
  }

  /* ---------------------------------------------------------- EmptyState */
  function EmptyState(props) {
    return h("div", { className: cx("ps-empty", props.className) },
      h("span", { className: "ps-empty__icon" },
        h(Icon, { name: props.icon || "document", size: 32 })),
      h("p", { className: "ps-empty__title" }, props.title),
      props.text ? h("p", { className: "ps-empty__text" }, props.text) : null,
      props.actions ? h("div", { className: "ps-empty__actions" }, props.actions) : null);
  }

  /* --------------------------------------------------------- SignaturePad */
  function SignaturePad(props) {
    var mode = props.mode || "draw";
    function tab(id, label) {
      return h("button", {
        type: "button",
        className: cx("ps-sig__tab", mode === id ? "ps-sig__tab--on" : ""),
        "aria-pressed": mode === id ? "true" : "false",
        onClick: props.onModeChange ? function () { props.onModeChange(id); } : undefined
      }, label);
    }
    return h("div", { className: cx("ps-sig", "ps-paper", props.className), style: { boxShadow: "none" } },
      h("div", { className: "ps-sig__tabs" }, tab("draw", "Draw"), tab("type", "Type")),
      h("div", { className: "ps-sig__pad" },
        h("div", { className: "ps-sig__rule" }),
        mode === "type"
          ? h("div", { className: "ps-sig__typed" }, props.typedValue || props.signerName || "")
          : (props.strokePath
              ? h("svg", { viewBox: "0 0 480 168", width: "100%", height: "168", "aria-label": "Signature" },
                  h("path", {
                    d: props.strokePath, fill: "none", stroke: "var(--paper-ink)",
                    strokeWidth: "var(--stroke-signature)", strokeLinecap: "round", strokeLinejoin: "round"
                  }))
              : null),
        h("span", { className: "ps-sig__hint" },
          mode === "draw" ? "Sign above with your finger or mouse" : "Your typed signature")),
      h("div", { className: "ps-sig__foot" },
        h("span", { style: { color: "var(--paper-muted)", fontFamily: "var(--font-sans)", fontSize: "13px" } },
          props.footNote),
        h(Button, { variant: "ghost", size: "sm", icon: "retry", onClick: props.onClear }, "Clear")));
  }

  /* --------------------------------------------------------- AuditTrail */
  function AuditTrail(props) {
    return h("table", { className: cx("ps-audit", props.className) },
      h("thead", null, h("tr", null,
        h("th", null, "Event"), h("th", null, "Actor"),
        h("th", null, "Origin"), h("th", null, "Time"))),
      h("tbody", null, (props.events || []).map(function (e, i) {
        return h("tr", { key: i },
          h("td", { className: "ps-audit__type" }, e.type),
          h("td", null,
            h("span", { style: e.byAI ? { color: "var(--ai)", fontWeight: 600 } : null }, e.actor),
            e.byAI ? h(Icon, { name: "ai", size: 12, style: { color: "var(--ai)", marginLeft: "6px" } }) : null),
          h("td", { className: "ps-audit__meta" }, e.ip || "Not available",
            e.revision ? " · rev " + e.revision : ""),
          h("td", { className: "ps-audit__meta" }, e.at));
      })));
  }

  /* ---------------------------------------------------- StickyActionBar */
  function StickyActionBar(props) {
    return h("div", { className: cx("ps-bar", props.className) },
      h(TotalsPair, {
        oneTime: props.oneTime, monthly: props.monthly,
        currency: props.currency, size: "lg"
      }),
      h("div", { style: { display: "flex", gap: "12px", alignItems: "center" } },
        props.secondary || null,
        h(Button, {
          variant: "primary", size: "xl", icon: props.actionIcon || "signature",
          onClick: props.onAction, disabled: props.disabled, loading: props.loading,
          loadingLabel: props.loadingLabel
        }, props.actionLabel || "Accept & sign")));
  }

  /* --------------------------------------------------------------- Badge */
  function Badge(props) {
    var tone = props.tone || "neutral";
    return h("span", {
      className: cx("ps-pill", props.variant === "outline" ? "ps-pill--outline" : "ps-tone-" + tone,
        props.className),
      title: props.title
    },
      props.icon ? h(Icon, { name: props.icon, size: 14 }) : null,
      h("span", null, props.children));
  }

  /* ---------------------------------------------------------- FilterChip */
  function FilterChip(props) {
    var on = !!props.active;
    return h("span", { className: cx("ps-chip", on ? "ps-chip--on" : "", props.className) },
      h("button", {
        type: "button", className: "ps-chip__main", onClick: props.onClick,
        "aria-pressed": on ? "true" : "false"
      },
        h("span", { className: "ps-chip__label" }, props.label + ":"),
        h("span", null, props.value)),
      on && props.onClear
        ? h("button", {
            type: "button", className: "ps-chip__x", onClick: props.onClear,
            "aria-label": "Clear " + props.label + " filter"
          }, h(Icon, { name: "close", size: 12 }))
        : null);
  }

  /* ------------------------------------------------------------- Toolbar */
  function Toolbar(props) {
    var items = props.items || [];
    var segmented = props.selected !== undefined && props.selected !== null;
    return h("div", {
      className: cx("ps-toolbar", props.size === "lg" ? "ps-toolbar--lg" : "", props.className),
      role: segmented ? "group" : "toolbar",
      "aria-label": props.label
    }, items.map(function (it, i) {
      if (it.separator) return h("span", { className: "ps-toolbar__sep", key: "s" + i });
      var on = segmented && props.selected === it.id;
      return h("button", {
        type: "button", key: it.id || i,
        className: cx("ps-toolbar__btn", on ? "ps-toolbar__btn--on" : ""),
        disabled: it.disabled,
        "aria-pressed": segmented ? (on ? "true" : "false") : undefined,
        "aria-label": it.label ? undefined : it.title,
        title: it.title,
        onClick: props.onSelect ? function () { props.onSelect(it.id); } : undefined
      },
        it.icon ? h(Icon, { name: it.icon, size: 14 }) : null,
        it.label ? h("span", null, it.label) : null);
    }));
  }

  global.ProposalDS = {
    Icon: Icon, Button: Button, StatusPill: StatusPill, JobState: JobState,
    TotalsPair: TotalsPair, PricingTable: PricingTable, Banner: Banner,
    Field: Field, Checkbox: Checkbox, SignaturePad: SignaturePad,
    DataTable: DataTable, EmptyState: EmptyState, ReadinessChecklist: ReadinessChecklist,
    VariableChip: VariableChip, AuditTrail: AuditTrail, StickyActionBar: StickyActionBar,
    Badge: Badge, FilterChip: FilterChip, Toolbar: Toolbar,
    formatMoney: formatMoney, icons: ICONS
  };
})(window);
