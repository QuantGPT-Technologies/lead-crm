import { TAB_STORAGE } from "@/lib/tab-session-constants";

/**
 * Runs while the HTML is parsed, before first paint. A tab that holds its own session key shows
 * the page at once; any other tab keeps it hidden until WorkspaceGuard sends it to sign-in.
 * WorkspaceGuard still checks the key with the server in the background and blanks the
 * screen if that fails. Render it just before <WorkspaceGuard>.
 */
export function TabCheckScript() {
  const js = `try{if(!window.opener&&sessionStorage.getItem(${JSON.stringify(TAB_STORAGE)}))document.documentElement.dataset.crmTab="1"}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
