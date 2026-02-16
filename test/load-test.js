import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 50, // usuários simultâneos
  duration: '30s',
};

export default function () {
  http.get('http://localhost:3001/swaps/latest');
  http.get('http://localhost:3001/swaps?limit=50');
  sleep(0.1);
}
