"""Every check, imported for its registration side effect. Order here is report order."""
from . import schema      # noqa: F401  what shape is the data
from . import sources     # noqa: F401  does it lead back to a document
from . import stages      # noqa: F401  is an estimate ever shown as an outcome
from . import arithmetic  # noqa: F401  do the derived numbers still hold
from . import reconcile   # noqa: F401  do independent sources still agree
from . import audit       # noqa: F401  do the published comparisons equal their inputs
from . import register   # noqa: F401  is any printed figure not the government's
from . import i18n        # noqa: F401  will any reader see a raw key
from . import links       # noqa: F401  do the documents still exist
