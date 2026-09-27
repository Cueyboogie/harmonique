import { Controller } from '../controller';
import { mountMonitor } from '../monitor/view';

mountMonitor(new Controller(), { mode: 'web' });
