import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const verifier = path.join(path.dirname(fileURLToPath(import.meta.url)), "verify_java_web_style.mjs");

async function fixture(source) {
  const root = await mkdtemp(path.join(os.tmpdir(), "java-web-style-"));
  const controllerDir = path.join(root, "server", "src", "main", "java", "com", "example", "server", "controller");
  await mkdir(controllerDir, { recursive: true });
  await writeFile(path.join(controllerDir, "RoleController.java"), source, "utf8");
  return root;
}

function verify(root) {
  return spawnSync(process.execPath, [verifier, "--project-root", root], { encoding: "utf8" });
}

test("拒绝单行 Javadoc 和压缩的 Mapping 方法", async (t) => {
  const root = await fixture(`package com.example.server.controller;
import org.springframework.web.bind.annotation.*;
/**
 * 角色管理接口。
 * @author Scaffold Tester
 * @date 2026/08/31 10:30
 */
@RestController
public class RoleController {
  /** 分页查询角色。 @param query 查询条件 @return 角色分页结果 */
  @PostMapping("/page") public String page(@RequestBody String query) { return query; }
}
`);
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /smart-doc-javadoc-contract/);
  assert.match(result.stderr, /java-format-contract/);
});

test("接受业务说明和 block tag 完整的多行 Controller", async (t) => {
  const root = await fixture(`package com.example.server.controller;
import org.springframework.web.bind.annotation.*;
/**
 * 角色管理接口。
 *
     * @author Scaffold Tester
 * @date 2026/08/31 10:30
 */
@RestController
public class RoleController {
  /**
   * 分页查询角色。
   *
   * @author system
   * @date 2026/08/31 10:30
   * @param query 角色分页查询条件
   * @return 角色分页结果
   */
  @PostMapping("/page")
  public String page(
      @RequestBody String query) {
    return query;
  }
}
`);
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = verify(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Java Web 格式与 Smart-doc Javadoc 验证通过/);
});

test("拒绝缺失参数标签或返回标签", async (t) => {
  const root = await fixture(`package com.example.server.controller;
import org.springframework.web.bind.annotation.*;
/**
 * 角色管理接口。
 * @author system
 * @date 2026/08/31 10:30
 */
@RestController
public class RoleController {
  /**
   * 查询角色。
   * @author system
   * @date 2026/08/31 10:30
   */
  @GetMapping("/{id}")
  public String detail(
      @PathVariable Long id) {
    return String.valueOf(id);
  }
}
`);
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = verify(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /@param id/);
  assert.match(result.stderr, /@return/);
});
