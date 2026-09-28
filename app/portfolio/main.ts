import { Controller } from '../controller';
import { mountMonitor } from '../monitor/view';

// The portfolio page (theavidobserver.com/side-quests/harmonique/): the web version plus a way back to the grid.
mountMonitor(new Controller(), { mode: 'web', exitHref: '/' });
