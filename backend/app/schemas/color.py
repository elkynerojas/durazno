from typing import Annotated

from pydantic import AfterValidator, StringConstraints

# Color hexadecimal de 6 dígitos (`#ffd60a`), guardado en minúsculas.
ColorHex = Annotated[
    str,
    StringConstraints(strip_whitespace=True, pattern=r"^#[0-9a-fA-F]{6}$"),
    AfterValidator(str.lower),
]
