import { Grid2x2, Laptop, Settings, Workflow, type LucideIcon } from 'lucide-react';

/**
 * Mapa explícito de `modulos_sistema.icone` → componente Lucide. Evitamos
 * importar o dicionário `icons` completo do lucide-react (todos os ícones,
 * ~600KB minificados) só para resolver um nome dinâmico — ao adicionar um
 * módulo novo, importe o ícone específico e registre aqui.
 */
const ICONES: Record<string, LucideIcon> = {
  Settings,
  Laptop,
  Workflow,
};

export function iconePorNome(nome: string): LucideIcon {
  return ICONES[nome] ?? Grid2x2;
}
