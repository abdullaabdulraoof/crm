export interface LoginRequest {
  email: string;
  password: string;
}

export interface User {
  id: string;
  companyId: string | undefined;
  name: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    token: string;
    tokenType: string;
    expiresIn: string;
    user: User;
  };
}

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface MessageResponse {
  success: boolean;
  message: string;
}