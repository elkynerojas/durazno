// Borrador del aviso de tratamiento de datos (Ley 1581 de 2012, HU-06.3).
// Debe validarlo el director del trabajo de grado con la administración del predio.
export default function AvisoDatos() {
  return (
    <section className="aviso-datos" aria-labelledby="aviso-datos-titulo">
      <h3 id="aviso-datos-titulo">Aviso de tratamiento de datos personales</h3>
      <p>
        En cumplimiento de la Ley 1581 de 2012, el nombre y el correo del titular se usan solo para
        crear su cuenta en el aplicativo de trampeo del predio, identificar quién registra cada
        lectura y controlar el acceso según su rol. No se comparten con terceros ni se publican.
      </p>
      <p>
        El titular puede conocer, actualizar y rectificar sus datos, o solicitar que su cuenta se
        desactive, dirigiéndose al agrónomo responsable del predio.
      </p>
    </section>
  )
}
