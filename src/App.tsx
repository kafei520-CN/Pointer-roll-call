import {useEffect, useState} from 'react';
import {openOpenedWorkbook} from './lib/opened-template';
import {setupOpenWith} from './lib/open-with';
import {hydrate, useApp} from './lib/store';
import {parseHash, type Route} from './router';
import {ExportPage} from './screens/ExportPage';
import {Home} from './screens/Home';
import {ImportWizard} from './screens/ImportWizard';
import {SessionView} from './screens/SessionView';
import {TemplateEditor} from './screens/TemplateEditor';

export default function App() {
  const app = useApp();
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    let stopOpenWith = () => undefined as void;
    let cancelled = false;
    void (async () => {
      await hydrate();
      if (cancelled) {
        return;
      }
      const stop = await setupOpenWith((file) => {
        void openOpenedWorkbook(file);
      });
      if (cancelled) {
        stop();
        return;
      }
      stopOpenWith = stop;
    })();
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', onHash);
      stopOpenWith();
    };
  }, []);

  if (!app.ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper text-ink">
        <p className="text-sm tracking-[0.3em]">指针点名</p>
      </div>
    );
  }

  switch (route.name) {
    case 'import':
      return <ImportWizard />;
    case 'template':
      return <TemplateEditor id={route.id} />;
    case 'session':
      return <SessionView id={route.id} />;
    case 'export':
      return <ExportPage />;
    default:
      return <Home />;
  }
}
