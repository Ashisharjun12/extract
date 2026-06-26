import axios from 'axios';
import { _config } from '../../config/config.js';

export class AdminService {
  async checkAimoduleHealth() {
    const start = Date.now();
    try {
      const response = await axios.get(`${_config.AIMODULE_URL}/health`, { timeout: 5000 });
      return {
        ok: response.status === 200,
        status: response.status,
        message: response.data?.message ?? 'OK',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        message: err.message ?? 'aimodule unreachable',
        latencyMs: null,
      };
    }
  }
}
