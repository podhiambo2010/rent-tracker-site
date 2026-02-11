export function formatCurrency(amount) {
  if (amount == null) return "—";
  return "Ksh " + Number(amount).toLocaleString();
}

export function formatDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
