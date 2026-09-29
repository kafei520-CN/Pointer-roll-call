import {useEffect, useState} from 'react';
import {pushOpenedXlsx, setupOpenWith} from './lib/open-with';
import {hydrate, useApp} from './lib/store';
import {go, parseHash, type Route} from './router';
import {Home} from './screens/Home';
import {ImportWizard} from './screens/ImportWizard';
import {SessionView} from './screens/SessionView';
import {TemplateEditor} from './screens/TemplateEditor';

export default function App() {
  const app = useApp();
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    void hydrate();
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    let stopOpenWith = () => undefined as void;
    void setupOpenWith((file) => {
      pushOpenedXlsx(file);
      go('/import');
    }).then((stop) => {
      stopOpenWith = stop;
    });
    return () => {
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
    default:
      return <Home />;
  }
}
