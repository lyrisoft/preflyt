import { createAppRouter } from './app'
import { renderApp } from './render-app'
import './styles/index.css'

const router = createAppRouter()
const root = document.getElementById('root')!
void renderApp(router, root)
