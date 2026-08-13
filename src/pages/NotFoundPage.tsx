import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <section className="page" aria-labelledby="not-found-title">
      <h1 id="not-found-title">页面走丢了</h1>
      <p>这个地址不在当前的求职地图里。</p>
      <Link to="/">返回求职驾驶舱</Link>
    </section>
  )
}
