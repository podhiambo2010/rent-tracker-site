import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function NewPayment() {
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from("form_payments").insert([
      {
        amount: Number(amount),
        payer_name: payer,
        paid_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("✅ Payment recorded!");
      window.location.href = "/";
    }

    setLoading(false);
  }

  return (
    <div style={{ padding: "20px" }}>
      <h2>Record Payment</h2>

      <form onSubmit={handleSubmit}>
        <input
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <br /><br />

        <input
          placeholder="Payer Name"
          value={payer}
          onChange={(e) => setPayer(e.target.value)}
        />
        <br /><br />

        <button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save Payment"}
        </button>
      </form>
    </div>
  );
}