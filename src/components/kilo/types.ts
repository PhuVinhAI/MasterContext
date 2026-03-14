export interface KiloActivity {
  id: number;
  type: 'tool' | 'command' | 'info' | 'error' | 'success';
  title: string;
  details: string[];
  status: 'pending' | 'success' | 'error';
}
