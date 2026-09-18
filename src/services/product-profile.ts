import type { Product, ProductDecisionProfile } from "@/src/domain/commerce";

const profile = (questions: ProductDecisionProfile["questions"], acceptedPreferences: string[], attributes: string[]): ProductDecisionProfile => ({ questions, acceptedPreferences, attributes });

export function getProductDecisionProfile(product: Product): ProductDecisionProfile {
  if (product.decisionProfile) return product.decisionProfile;
  const catalogText = `${product.title} ${product.subcategory ?? ""} ${product.subtitle ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (product.productKind === "beauty" || product.category === "Maquiagem") {
    const shade = product.variants.map((variant) => variant.title ?? "").filter(Boolean);
    const finish = catalogText.includes("matte") || catalogText.includes("mate") ? "Matte" : catalogText.includes("brilho") || catalogText.includes("luminos") ? "Luminoso e confortável" : catalogText.includes("cremos") || catalogText.includes("natural") ? "Natural e leve" : "Acabamento não informado";
    return profile([
      { id: "finish", label: "Qual acabamento você procura?", options: [finish] },
      { id: "use", label: "Para qual uso você está escolhendo?", options: ["Dia a dia", "Trabalho ou encontro", "Evento ou produção"] },
    ], [...shade, finish, "Dia a dia", "Trabalho ou encontro", "Evento ou produção"], [product.subcategory ?? "maquiagem", ...shade, finish]);
  }
  if (product.productKind === "accessory" || product.category === "Acessórios") {
    const material = catalogText.includes("couro") ? "Couro" : catalogText.includes("brinco") || catalogText.includes("metal") ? "Metal" : catalogText.includes("tecido") ? "Tecido" : "Material não informado";
    return profile([
      { id: "material", label: "Qual material combina com sua escolha?", options: [material] },
      { id: "use", label: "Como você pretende usar?", options: ["Dia a dia", "Trabalho", "Ocasião especial", "Presente"] },
    ], [product.subcategory ?? "acessório", material, "Dia a dia"], [product.subcategory ?? "acessório", material]);
  }
  if (product.productKind === "lifestyle" || product.category === "Lifestyle") {
    const material = catalogText.includes("caderno") || catalogText.includes("papel") ? "Papel e materiais naturais" : catalogText.includes("almofada") || catalogText.includes("tecido") ? "Tecido" : catalogText.includes("ceramic") ? "Cerâmica" : catalogText.includes("madeira") ? "Madeira" : "Material não informado";
    return profile([
      { id: "material", label: "Qual material combina com o ambiente?", options: [material] },
      { id: "use", label: "O que você busca para o ambiente?", options: ["Praticidade", "Aconchego", "Personalidade"] },
    ], [product.subcategory ?? "lifestyle", material, "Praticidade", "Aconchego", "Personalidade"], [product.subcategory ?? "lifestyle", material]);
  }
  return profile([
    { id: "fabric", label: "Como você prefere a sensação da peça?", options: ["Leve e fluida", "Estruturada", "Macia e confortável"] },
    { id: "use", label: "Você pretende usar com sobreposição?", options: ["Sim", "Não", "Ainda não sei"] },
  ], ["Leve e fluida", "Macia e confortável", "Ainda não sei"], [product.subtitle ?? "moda"]);
}

export function productQuestions(product: Product) {
  return getProductDecisionProfile(product).questions;
}
