

export function planTitle(p: Pick<Plan, "vendor" | "plan">) {
    const parts = String(p.vendor || "").split(/\s+/).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && String(p.plan || "").startsWith(last))
        return parts.slice(0, -1).concat(p.plan).join(" ");
    return `${p.vendor} ${p.plan}`;
}

export function splitModelAccess(text: string | null | undefined) {
    const parts = String(text || "").split(/[；;]/);
    if (parts.length >= 2 && /按(?:\s*M\s*token|牌价|量)/.test(parts[parts.length - 1]!)) {
        return { included: parts.slice(0, -1).join("；"), metered: parts[parts.length - 1]! };
    }
    return { included: String(text || ""), metered: "" };
}
