import { PROJECT_NAME, TRADEMARK_DISCLAIMER } from '@/lib/project';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>{TRADEMARK_DISCLAIMER}</p>
      <p>
        {PROJECT_NAME} is open-source software released under the MIT License. It runs entirely in
        your browser and sends nothing to any server.
      </p>
    </footer>
  );
}
