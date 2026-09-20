import type { Product, ProductDecisionProfile, TextileProfile } from "@/src/domain/commerce";

const profile = (questions: ProductDecisionProfile["questions"], acceptedPreferences: string[], attributes: string[]): ProductDecisionProfile => ({ questions, acceptedPreferences, attributes });

const textile = (value: Omit<TextileProfile, "origin" | "evidence">): TextileProfile => ({
  ...value,
  origin: "synthetic",
  evidence: ["Perfil editorial Vértice; validar composição no cadastro do produto antes de uso comercial."],
});

export function getTextileProfile(product: Product): TextileProfile | undefined {
  if (product.textileProfile) return product.textileProfile;
  const text = `${product.title} ${product.subtitle ?? ""} ${product.description ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (text.includes("aurora") || text.includes("linho")) return textile({ material: "Linho", composition: "100% linho pré-encolhido", elasticity: "none", structure: "structured", drape: "respirável, com forma definida e pouca cedência", care: ["Lavar em ciclo delicado e secar à sombra."] });
  if (text.includes("sereno")) return textile({ material: "Algodão", composition: "100% algodão penteado", elasticity: "low", structure: "structured", drape: "reto e encorpado", care: ["Lavar em ciclo delicado e passar em temperatura média."] });
  if (text.includes("trama") || text.includes("tricot") || text.includes("trico")) return textile({ material: "Tricô de algodão", composition: "Fio de algodão", elasticity: "medium", structure: "fluid", drape: "maleável e respirável", care: ["Lavar à mão e secar na horizontal."] });
  if (text.includes("eixo")) return textile({ material: "Viscose com lã fria", composition: "Mistura de viscose e lã fria", elasticity: "low", structure: "balanced", drape: "alfaiataria fluida com queda ampla", care: ["Preferir lavagem profissional ou ciclo delicado conforme etiqueta."] });
  if (text.includes("lume") || text.includes("sarja")) return textile({ material: "Sarja de algodão", composition: "Algodão de gramatura alta", elasticity: "low", structure: "structured", drape: "firme e utilitário", care: ["Passar pelo avesso em temperatura média."] });
  if (text.includes("orbita") || text.includes("la natural")) return textile({ material: "Tricô de lã e algodão", composition: "Mistura de lã natural e algodão", elasticity: "medium", structure: "balanced", drape: "envolvente e naturalmente amplo", care: ["Lavar à mão e secar na horizontal."] });
  return undefined;
}

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
