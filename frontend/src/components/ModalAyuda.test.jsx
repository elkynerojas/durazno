import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../test/utilidades'
import { VERSION } from '../version'
import paquete from '../../package.json'
import ModalAyuda from './ModalAyuda'

describe('ModalAyuda', () => {
  it('muestra la versión, la de la API, el copyright y el enlace al manual', async () => {
    simularFetch(respuestaJson(200, { version: '1.0.0', api: 'ok', base_datos: 'ok' }))
    render(<ModalAyuda alCerrar={vi.fn()} />)

    const dialogo = screen.getByRole('dialog', { name: 'Ayuda' })
    expect(dialogo).toHaveAttribute('aria-modal', 'true')
    expect(VERSION).toBe(paquete.version)
    expect(dialogo).toHaveTextContent(`Versión${VERSION}`)
    expect(await screen.findByText('1.0.0', { selector: 'dd:nth-of-type(2)' })).toBeInTheDocument()
    expect(dialogo).toHaveTextContent('© 2026 Luis e Ingry')
    expect(dialogo).toHaveTextContent('Instituto Superior de Educación Rural (ISER)')
    const manual = screen.getByRole('link', { name: 'Manual de usuario (PDF)' })
    expect(manual).toHaveAttribute('href', '/manual-usuario.pdf')
    expect(manual).toHaveAttribute('target', '_blank')
    expect(manual).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus()
  })

  it('sin conexión con la API lo indica', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('red'))),
    )
    render(<ModalAyuda alCerrar={vi.fn()} />)
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
  })

  it('se cierra con Esc, con «Cerrar» o tocando fuera, pero no al tocar dentro', async () => {
    simularFetch(respuestaJson(200, { version: '1.0.0' }))
    const alCerrar = vi.fn()
    const usuarioEvento = userEvent.setup()
    render(<ModalAyuda alCerrar={alCerrar} />)

    await usuarioEvento.click(screen.getByRole('dialog'))
    expect(alCerrar).not.toHaveBeenCalled()
    await usuarioEvento.keyboard('{Escape}')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Cerrar' }))
    await usuarioEvento.click(screen.getByRole('dialog').parentElement)
    expect(alCerrar).toHaveBeenCalledTimes(3)
  })
})
