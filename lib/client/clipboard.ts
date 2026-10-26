export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // LAN HTTP does not expose the async clipboard API in every browser.
    }
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("The browser did not allow copying. Select and copy the link manually.");
}

export function campaignJoinUrl(code: string) {
  return new URL(`/join/${code}`, window.location.origin).toString();
}

