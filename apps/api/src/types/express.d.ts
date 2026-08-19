export interface RequestUsuario {
  id: number;
  filialAtivaId: number;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: RequestUsuario;
    }
  }
}
