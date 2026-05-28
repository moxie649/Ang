// 1.下载react-router-dom：npm install react-router-dom
// 2.创建路由器：createBrowserRouter
import { createBrowserRouter } from 'react-router-dom'
// import Login from '../pages/Login'
// import Article from '../pages/Article'
// import Layout from '../pages/Layout'
// import Board from '../pages/Board'
// import About from '../pages/About'

const router = createBrowserRouter([
//   {
//     path: '/',
//     element: <Layout />,
//     children: [
//       {
//         index: true,
//         element: <Navigate to="/board" replace />
//       },
//       {
//         path: 'board',
//         element: <Board />
//       },
//       {
//         path: 'about',
//         element: <About />
//       }
//     ]
//   },
//   {
//     path: '/login',
//     //vue:component:<Login/>
//     element: <Login />
//   },
//   {
//     // 2.params传参方式
//     path: '/article/:id/:title',
//     element: <Article />
//   }
])

export default router
