"""Where documents come from: a local folder standing in for the SharePoint library, or SharePoint itself.

Both sources answer the same question - "which files are new since last time?" - and hand them to the
ingest pipeline. SharePoint is read through Microsoft Graph with a delta query, so a nightly sync only
touches what changed; the delta link is persisted between runs.
"""

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.config import settings
from app.db import Store
from app.ingest.pipeline import ingest_path
from app.models import Document, SyncState

SUPPORTED = (".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff")
INBOX = settings.data_dir / "inbox"


@dataclass
class NewFile:
    path: Path
    origin: str  # local path or SharePoint item URL


class LocalFolderSource:
    """The demo's 'SharePoint': a folder; new = not yet ingested (by content hash)."""

    def __init__(self, folder: Path):
        self.folder = folder

    def new_files(self, session: Store) -> list[NewFile]:
        known = session.known_shas()
        out = []
        for path in sorted(p for p in self.folder.iterdir() if p.suffix.lower() in SUPPORTED):
            if hashlib.sha256(path.read_bytes()).hexdigest() not in known:
                out.append(NewFile(path, str(path)))
        return out


class SharePointSource:
    """Microsoft Graph: client-credentials token, then /drives/{id}/root/delta on the contracts library.

    Requires an Entra ID app registration with Sites.Read.All (application permission). Not exercised in
    the test suite - there is no tenant here - but the call shapes are the documented Graph ones.
    """

    GRAPH = "https://graph.microsoft.com/v1.0"
    STATE_KEY = "sharepoint_delta_link"

    def _token(self) -> str:
        import msal

        app = msal.ConfidentialClientApplication(
            settings.entra_client_id, authority=f"https://login.microsoftonline.com/{settings.entra_tenant_id}",
            client_credential=settings.entra_client_secret)
        result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
        if "access_token" not in result:
            raise RuntimeError(f"Graph token failed: {result.get('error_description', result)}")
        return result["access_token"]

    def new_files(self, session: Store) -> list[NewFile]:
        headers = {"Authorization": f"Bearer {self._token()}"}
        state = session.get(SyncState, self.STATE_KEY)
        url = state.value if state else (f"{self.GRAPH}/drives/{settings.sharepoint_drive_id}/root:"
                                         f"/{settings.sharepoint_folder}:/delta")
        INBOX.mkdir(exist_ok=True)
        out: list[NewFile] = []
        with httpx.Client(timeout=60) as client:
            while url:
                page = client.get(url, headers=headers).raise_for_status().json()
                for item in page.get("value", []):
                    name = item.get("name", "")
                    if "file" not in item or "deleted" in item or not name.lower().endswith(SUPPORTED):
                        continue
                    data = client.get(item["@microsoft.graph.downloadUrl"]).raise_for_status().content
                    path = INBOX / f"{item['id'][-8:]}_{re.sub(r'[^\\w.-]', '_', name)}"
                    path.write_bytes(data)
                    out.append(NewFile(path, item.get("webUrl", name)))
                url = page.get("@odata.nextLink")
                if "@odata.deltaLink" in page:  # remember where we got to
                    if state is None:
                        state = SyncState(key=self.STATE_KEY, value=page["@odata.deltaLink"])
                        session.add(state)
                    else:
                        state.value = page["@odata.deltaLink"]
                    session.commit()
        return out


def source():
    if settings.document_source == "sharepoint":
        return SharePointSource()
    return LocalFolderSource(settings.document_source_path)


def sync(session: Store, actor: str = "system") -> list[Document]:
    """Ingest everything the source reports as new. Idempotent: the pipeline skips known checksums anyway."""
    return [ingest_path(session, f.path, actor) for f in source().new_files(session)]
