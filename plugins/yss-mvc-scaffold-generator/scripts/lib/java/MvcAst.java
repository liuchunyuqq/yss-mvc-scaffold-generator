import com.sun.source.tree.*;
import com.sun.source.util.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import javax.tools.*;

/** 仅使用 JDK 解析树，不加载项目代码，不将解析结果冒充类型检查或 Bean 装配验证。 */
public class MvcAst {
    static String q(String value) {
        if (value == null) return "null";
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + "\"";
    }
    static String array(Collection<String> values) {
        List<String> result = new ArrayList<>();
        for (String value : values) result.add(q(value));
        return "[" + String.join(",", result) + "]";
    }
    public static void main(String[] args) throws Exception {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("JDK compiler required");
        List<String> files = Files.readAllLines(Paths.get(args[0]), StandardCharsets.UTF_8);
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        try (StandardJavaFileManager manager = compiler.getStandardFileManager(diagnostics, null, StandardCharsets.UTF_8)) {
            JavacTask task = (JavacTask) compiler.getTask(null, manager, diagnostics, Arrays.asList("-proc:none"), null, manager.getJavaFileObjectsFromStrings(files));
            DocTrees docs = DocTrees.instance(task);
            List<String> classes = new ArrayList<>();
            for (CompilationUnitTree unit : task.parse()) {
                final String pkg = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
                final List<String> imports = new ArrayList<>();
                for (ImportTree imp : unit.getImports()) imports.add(imp.getQualifiedIdentifier().toString());
                new TreePathScanner<Void, String>() {
                    @Override public Void visitClass(ClassTree node, String owner) {
                        String name = node.getSimpleName().toString();
                        if (name.isEmpty()) return super.visitClass(node, owner);
                        String full = (owner == null ? pkg : owner) + "." + name;
                        List<String> refs = new ArrayList<>(), methods = new ArrayList<>(), fields = new ArrayList<>(), interfaces = new ArrayList<>();
                        for (Tree type : node.getImplementsClause()) interfaces.add(type.toString());
                        new TreeScanner<Void, Void>() {
                            @Override public Void visitVariable(VariableTree n, Void p) { if (n.getType() != null) refs.add(n.getType().toString()); return super.visitVariable(n,p); }
                            @Override public Void visitNewClass(NewClassTree n, Void p) { refs.add(n.getIdentifier().toString()); return super.visitNewClass(n,p); }
                            @Override public Void visitMethodInvocation(MethodInvocationTree n, Void p) {
                                if(n.getMethodSelect() instanceof MemberSelectTree) refs.add(((MemberSelectTree)n.getMethodSelect()).getExpression().toString());
                                else for(ImportTree imp : unit.getImports()) if(imp.isStatic()) {
                                    String imported=imp.getQualifiedIdentifier().toString();
                                    if(imported.endsWith("."+n.getMethodSelect().toString()) || imported.endsWith(".*")) refs.add(imported.substring(0,imported.lastIndexOf('.')));
                                }
                                return super.visitMethodInvocation(n,p);
                            }
                            @Override public Void visitMemberReference(MemberReferenceTree n, Void p) { refs.add(n.getQualifierExpression().toString()); return super.visitMemberReference(n,p); }
                        }.scan(node, null);
                        if (node.getExtendsClause() != null) refs.add(node.getExtendsClause().toString());
                        refs.addAll(interfaces);
                        for (Tree member : node.getMembers()) {
                            TreePath memberPath = new TreePath(getCurrentPath(), member);
                            String doc = docs.getDocCommentTree(memberPath) == null ? "" : docs.getDocCommentTree(memberPath).toString();
                            if (member instanceof VariableTree) {
                                VariableTree field = (VariableTree) member;
                                fields.add("{\"name\":"+q(field.getName().toString())+",\"type\":"+q(field.getType().toString())+",\"annotations\":"+q(field.getModifiers().getAnnotations().toString())+",\"doc\":"+q(doc)+"}");
                            } else if (member instanceof MethodTree) {
                                MethodTree method = (MethodTree) member;
                                methods.add("{\"name\":"+q(method.getName().toString())+",\"returnType\":"+q(method.getReturnType() == null ? null : method.getReturnType().toString())+",\"public\":"+(node.getKind() == Tree.Kind.INTERFACE || method.getModifiers().getFlags().contains(javax.lang.model.element.Modifier.PUBLIC))+",\"doc\":"+q(doc)+"}");
                            }
                        }
                        classes.add("{\"name\":"+q(full)+",\"simpleName\":"+q(name)+",\"file\":"+q(Paths.get(unit.getSourceFile().toUri()).toString())+",\"kind\":"+q(node.getKind().toString())+",\"annotations\":"+q(node.getModifiers().getAnnotations().toString())+",\"extends\":"+q(node.getExtendsClause() == null ? "" : node.getExtendsClause().toString())+",\"interfaces\":"+array(interfaces)+",\"imports\":"+array(imports)+",\"refs\":"+array(refs)+",\"fields\":["+String.join(",",fields)+"],\"methods\":["+String.join(",",methods)+"]}");
                        return super.visitClass(node, full);
                    }
                }.scan(unit, null);
            }
            for (Diagnostic<?> diagnostic : diagnostics.getDiagnostics()) if (diagnostic.getKind() == Diagnostic.Kind.ERROR) throw new IllegalArgumentException(diagnostic.toString());
            System.out.println("["+String.join(",",classes)+"]");
        }
    }
}
