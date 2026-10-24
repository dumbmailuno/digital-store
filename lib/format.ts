/** "50.000000000000000000" -> "50", "0.0125000000" -> "0.0125" (display only; never use for maths). */
export const trimDecimal = (s: string | number) => String(s).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
