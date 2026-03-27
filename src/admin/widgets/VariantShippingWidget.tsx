import type { ProductDetailsWidgetProps, WidgetConfig } from "@medusajs/admin";
import { useEffect, useReducer } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type VariantRow = {
  id: string;
  title: string;
  sku: string | null;
  shipping_option_price_extra: number; // cents – persisted value
  edited: number; // cents – current input value (may differ before save)
  saving: boolean;
  error: string | null;
};

type State = {
  rows: VariantRow[];
  globalError: string | null;
};

type Action =
  | { type: "SET_ROWS"; rows: VariantRow[] }
  | { type: "SET_EDITED"; variantId: string; value: number }
  | { type: "SET_SAVING"; variantId: string; saving: boolean }
  | { type: "SET_ROW_ERROR"; variantId: string; error: string | null }
  | { type: "SAVED"; variantId: string; newExtra: number }
  | { type: "SET_GLOBAL_ERROR"; error: string | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_ROWS":
      return { ...state, rows: action.rows };
    case "SET_EDITED":
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.variantId ? { ...r, edited: action.value } : r
        ),
      };
    case "SET_SAVING":
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.variantId ? { ...r, saving: action.saving } : r
        ),
      };
    case "SET_ROW_ERROR":
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.variantId ? { ...r, error: action.error } : r
        ),
      };
    case "SAVED":
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.variantId
            ? {
                ...r,
                shipping_option_price_extra: action.newExtra,
                edited: action.newExtra,
                saving: false,
                error: null,
              }
            : r
        ),
      };
    case "SET_GLOBAL_ERROR":
      return { ...state, globalError: action.error };
    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert cents integer to euros string for display (e.g. 1050 → "10.50") */
function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Parse a euro-formatted string to cents, returns NaN if invalid */
function eurosToCents(euros: string): number {
  const parsed = parseFloat(euros.replace(",", "."));
  if (isNaN(parsed) || parsed < 0) return NaN;
  return Math.round(parsed * 100);
}

async function fetchVariant(
  productId: string,
  variantId: string,
  token: string
): Promise<{ shipping_option_price_extra: number } | null> {
  const res = await fetch(
    `/admin/products/${productId}/variants/${variantId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.variant ?? null;
}

async function patchVariant(
  productId: string,
  variantId: string,
  shipping_option_price_extra: number,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `/admin/products/${productId}/variants/${variantId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shipping_option_price_extra }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body.message ?? "Error al guardar" };
  }
  return { ok: true };
}

/** Read JWT token from localStorage (Medusa admin stores it there) */
function getAdminToken(): string {
  try {
    return localStorage.getItem("_medusa_jwt") ?? "";
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget
// ─────────────────────────────────────────────────────────────────────────────

const VariantShippingWidget = ({ product, notify }: ProductDetailsWidgetProps) => {
  const [state, dispatch] = useReducer(reducer, {
    rows: [],
    globalError: null,
  });

  useEffect(() => {
    if (!product?.variants?.length) return;

    const token = getAdminToken();

    const rows: VariantRow[] = product.variants.map((v: any) => ({
      id: v.id,
      title: v.title ?? "",
      sku: v.sku ?? null,
      shipping_option_price_extra: v.shipping_option_price_extra ?? 0,
      edited: v.shipping_option_price_extra ?? 0,
      saving: false,
      error: null,
    }));

    // If the product came from the native list, shipping_option_price_extra
    // might not be loaded. Fetch each variant individually.
    const needsFetch = rows.some((r) => r.shipping_option_price_extra === 0);
    if (!needsFetch) {
      dispatch({ type: "SET_ROWS", rows });
      return;
    }

    dispatch({ type: "SET_ROWS", rows });

    // Refresh each row from the API
    rows.forEach(async (row) => {
      const variant = await fetchVariant(product.id, row.id, token);
      if (variant != null) {
        const extra = variant.shipping_option_price_extra ?? 0;
        dispatch({ type: "SET_EDITED", variantId: row.id, value: extra });
        dispatch({ type: "SAVED", variantId: row.id, newExtra: extra });
      }
    });
  }, [product?.id]);

  const handleSave = async (row: VariantRow) => {
    const cents = row.edited;
    if (isNaN(cents) || cents < 0) {
      dispatch({
        type: "SET_ROW_ERROR",
        variantId: row.id,
        error: "Introduce un importe válido (≥ 0)",
      });
      return;
    }

    dispatch({ type: "SET_SAVING", variantId: row.id, saving: true });
    dispatch({ type: "SET_ROW_ERROR", variantId: row.id, error: null });

    const token = getAdminToken();
    const result = await patchVariant(product.id, row.id, cents, token);

    if (result.ok) {
      dispatch({ type: "SAVED", variantId: row.id, newExtra: cents });
      notify.success("Guardado", `Recargo actualizado para ${row.title}`);
    } else {
      dispatch({ type: "SET_SAVING", variantId: row.id, saving: false });
      dispatch({
        type: "SET_ROW_ERROR",
        variantId: row.id,
        error: result.error ?? "Error al guardar",
      });
    }
  };

  if (!state.rows.length) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-rounded p-6">
      <div className="mb-4">
        <h2 className="inter-large-semibold text-grey-90">
          Recargo extra de envío por variante
        </h2>
        <p className="inter-small-regular text-grey-50 mt-1">
          Importe adicional (€) sumado al precio del método de envío por unidad.
          Fórmula: <code>extra = recargo × cantidad</code> por item.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-4 text-left inter-small-semibold text-grey-50">
                Variante
              </th>
              <th className="py-2 pr-4 text-left inter-small-semibold text-grey-50">
                SKU
              </th>
              <th className="py-2 pr-4 text-left inter-small-semibold text-grey-50">
                Recargo extra (€)
              </th>
              <th className="py-2 text-left inter-small-semibold text-grey-50">
                Acción
              </th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row) => {
              const isDirty =
                row.edited !== row.shipping_option_price_extra;
              return (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="py-3 pr-4 inter-small-regular text-grey-90">
                    {row.title}
                  </td>
                  <td className="py-3 pr-4 inter-small-regular text-grey-50">
                    {row.sku ?? "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={centsToEuros(row.edited)}
                      onChange={(e) => {
                        const cents = eurosToCents(e.target.value);
                        dispatch({
                          type: "SET_EDITED",
                          variantId: row.id,
                          value: isNaN(cents) ? row.edited : cents,
                        });
                      }}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-28 focus:outline-none focus:border-violet-600"
                      disabled={row.saving}
                    />
                    {row.error && (
                      <p className="text-red-500 inter-small-regular mt-1">
                        {row.error}
                      </p>
                    )}
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => handleSave(row)}
                      disabled={!isDirty || row.saving}
                      className={
                        "px-3 py-1 rounded text-sm font-medium " +
                        (isDirty && !row.saving
                          ? "bg-violet-600 text-white hover:bg-violet-700 cursor-pointer"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed")
                      }
                    >
                      {row.saving ? "Guardando…" : "Guardar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const config: WidgetConfig = {
  zone: "product.details.after",
};

export default VariantShippingWidget;
