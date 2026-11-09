/** Product identity only. Workspace logos belong to client documents. */
export function YeswellBrand({
  mark = false,
  reversed = false,
}: {
  mark?: boolean;
  reversed?: boolean;
}) {
  if (reversed)
    return (
      <span className={`yeswell-brand ${mark ? "yeswell-mark" : ""}`}>
        <img
          src={`/brand/yeswell/yeswell-${mark ? "mark" : "logo"}-reversed.svg`}
          alt="Yeswell"
        />
      </span>
    );
  return (
    <span className={`yeswell-brand ${mark ? "yeswell-mark" : ""}`}>
      <img
        className="yeswell-light"
        src={`/brand/yeswell/yeswell-${mark ? "mark" : "logo"}.svg`}
        alt="Yeswell"
      />
      <img
        className="yeswell-dark"
        src={`/brand/yeswell/yeswell-${mark ? "mark" : "logo"}-reversed.svg`}
        alt="Yeswell"
      />
    </span>
  );
}
